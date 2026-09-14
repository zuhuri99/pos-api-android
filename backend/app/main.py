from contextlib import asynccontextmanager
from datetime import datetime, timezone
import os
from pathlib import Path

from anyio import to_thread
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from sqlalchemy import select, text, update

from .api import auth, pos, products, sync
from .core.config import get_settings
from .core.db import Base, SessionLocal, engine
from .core.security import hash_password, verify_password
from .models import AccessToken, Business, Contact, Location, User


def bootstrap_database() -> None:
    Base.metadata.create_all(engine)
    settings = get_settings()
    with SessionLocal.begin() as db:
        business = db.scalar(select(Business).limit(1))
        if not business:
            business = Business(name="POS")
            db.add(business)
            db.flush()
        managed_accounts = (
            (settings.admin_username.strip(), settings.admin_password, True),
            (settings.user_username.strip(), settings.user_password, False),
        )
        if not all(username for username, _, _ in managed_accounts):
            raise RuntimeError("ADMIN_USERNAME dan USER_USERNAME wajib diisi.")
        if managed_accounts[0][0] == managed_accounts[1][0]:
            raise RuntimeError("ADMIN_USERNAME dan USER_USERNAME harus berbeda.")
        for username, password, is_admin in managed_accounts:
            user = db.scalar(select(User).where(User.username == username))
            if not user:
                db.add(User(
                    business_id=business.id, username=username,
                    password_hash=hash_password(password), is_admin=is_admin, is_active=True,
                ))
                continue
            user.business_id = business.id
            credentials_changed = user.is_admin != is_admin or not verify_password(password, user.password_hash)
            user.is_admin = is_admin
            user.is_active = True
            if credentials_changed:
                user.password_hash = hash_password(password)
                db.execute(
                    update(AccessToken)
                    .where(AccessToken.user_id == user.id, AccessToken.revoked_at.is_(None))
                    .values(revoked_at=datetime.now(timezone.utc))
                )
        db.execute(
            update(User)
            .where(
                User.business_id == business.id,
                User.username.not_in([account[0] for account in managed_accounts]),
            )
            .values(is_active=False)
        )
        if not db.scalar(select(Location).where(Location.business_id == business.id)):
            db.add(Location(business_id=business.id, name="Toko Utama"))
        if not db.scalar(select(Contact).where(Contact.business_id == business.id)):
            db.add(Contact(business_id=business.id, name="Umum"))


@asynccontextmanager
async def lifespan(_: FastAPI):
    to_thread.current_default_thread_limiter().total_tokens = get_settings().api_thread_limit
    bootstrap_database()
    yield


app = FastAPI(title="ASAS POS API", version="0.1.0", lifespan=lifespan)
settings = get_settings()
app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.allowed_hosts)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Idempotency-Key"],
    expose_headers=["Content-Disposition"],
)
app.include_router(auth.router)
app.include_router(pos.router)
app.include_router(products.router)
app.include_router(sync.router)


@app.get("/health", include_in_schema=False)
def health():
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
    except Exception as exc:
        raise HTTPException(503, "Database tidak tersedia.") from exc
    return {"status": "ok", "database": "ok"}


FRONTEND_DIR = Path(os.getenv("FRONTEND_DIR", "/app/frontend_dist")).resolve()


@app.get("/{full_path:path}", include_in_schema=False)
def frontend_app(full_path: str):
    """Layani build React dan fallback BrowserRouter tanpa menutupi 404 API."""
    if full_path.startswith(("api/", "docs", "redoc", "openapi.json")):
        raise HTTPException(404, "Endpoint tidak ditemukan.")
    candidate = (FRONTEND_DIR / full_path).resolve()
    if candidate.is_relative_to(FRONTEND_DIR) and candidate.is_file():
        return FileResponse(candidate)
    index = FRONTEND_DIR / "index.html"
    if index.is_file():
        return FileResponse(index, headers={"Cache-Control": "no-cache"})
    raise HTTPException(404, "Frontend belum dibangun.")
