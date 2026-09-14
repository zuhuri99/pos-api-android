from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..core.config import get_settings
from ..core.db import get_db
from ..core.security import new_token, token_digest, verify_password
from ..models import AccessToken, User
from ..schemas import LoginRequest
from .deps import current_user

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


@router.post("/login/")
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.username == payload.username))
    if not user or not user.is_active or not verify_password(payload.password, user.password_hash):
        raise HTTPException(401, "Username atau password salah.")
    raw_token = new_token()
    expires = datetime.now(timezone.utc) + timedelta(days=get_settings().token_ttl_days)
    db.add(AccessToken(user_id=user.id, digest=token_digest(raw_token), device_id=payload.device_id, expires_at=expires))
    db.commit()
    return {
        "token": raw_token,
        "token_expires_at": expires.isoformat(),
        "user": {"id": user.id, "username": user.username, "is_superuser": user.is_admin},
    }


@router.get("/token/verify/")
def verify(user: User = Depends(current_user)):
    return {"detail": "Token valid.", "user_id": user.id}

