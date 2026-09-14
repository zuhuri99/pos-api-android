from contextlib import asynccontextmanager
import os
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from sqlalchemy import select, text

from .api import auth, pos, products, sync
from .core.config import get_settings
from .core.db import Base, SessionLocal, engine
from .core.security import hash_password
from .models import Business, Contact, Location, User


def bootstrap_database() -> None:
    Base.metadata.create_all(engine)
    settings = get_settings()
    with SessionLocal.begin() as db:
        business = db.scalar(select(Business).limit(1))
        if not business:
            business = Business(name="POS")
            db.add(business)
            db.flush()
        if not db.scalar(select(User).where(User.username == settings.bootstrap_username)):
            db.add(User(
                business_id=business.id, username=settings.bootstrap_username,
                password_hash=hash_password(settings.bootstrap_password), is_admin=True,
            ))
        if not db.scalar(select(Location).where(Location.business_id == business.id)):
            db.add(Location(business_id=business.id, name="Toko Utama"))
        if not db.scalar(select(Contact).where(Contact.business_id == business.id)):
            db.add(Contact(business_id=business.id, name="Umum"))


@asynccontextmanager
async def lifespan(_: FastAPI):
    bootstrap_database()
    yield


app = FastAPI(title="POS API", version="0.1.0", lifespan=lifespan)
settings = get_settings()
app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.allowed_hosts)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
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
