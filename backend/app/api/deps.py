from datetime import datetime, timezone
import secrets

from fastapi import Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..core.db import get_db
from ..core.config import get_settings
from ..core.security import token_digest
from ..models import AccessToken, User


def current_user(
    authorization: str | None = Header(default=None), db: Session = Depends(get_db)
) -> User:
    if not authorization:
        raise HTTPException(401, "Token tidak tersedia.")
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() not in {"token", "bearer"} or not token:
        raise HTTPException(401, "Format token tidak valid.")
    access = db.scalar(select(AccessToken).where(AccessToken.digest == token_digest(token)))
    now = datetime.now(timezone.utc)
    if not access or access.revoked_at or access.expires_at.replace(tzinfo=timezone.utc) <= now:
        raise HTTPException(401, "Sesi tidak valid atau kedaluwarsa.")
    user = db.get(User, access.user_id)
    if not user or not user.is_active:
        raise HTTPException(401, "Pengguna tidak aktif.")
    return user


def current_admin(user: User = Depends(current_user)) -> User:
    if not user.is_admin:
        raise HTTPException(403, "Akses administrator diperlukan.")
    return user


def authorize_sale_delete(user: User, pin: str | None) -> None:
    if user.is_admin:
        return
    expected = get_settings().user_authorization_pin
    if not pin:
        raise HTTPException(403, "PIN otorisasi diperlukan untuk menghapus transaksi.")
    if not secrets.compare_digest(pin, expected):
        raise HTTPException(403, "PIN otorisasi tidak valid.")


def authorize_logout(user: User, pin: str | None) -> None:
    if user.is_admin:
        return
    expected = get_settings().user_authorization_pin
    if not pin:
        raise HTTPException(403, "PIN otorisasi diperlukan untuk keluar.")
    if not secrets.compare_digest(pin, expected):
        raise HTTPException(403, "PIN otorisasi tidak valid.")
