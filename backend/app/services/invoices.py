import re
from datetime import datetime

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Sale, User

INVOICE_RE = re.compile(r"^P(?P<month>\d{2})(?P<year>\d{4})(?P<user_code>[12])(?P<number>\d{3})$")


def invoice_user_code(user: User) -> int:
    """Kode stabil pada nota; tidak bergantung pada PK setelah restore database."""
    return 1 if user.is_admin else 2


def format_invoice(year: int, month: int, user_code: int, number: int) -> str:
    if not 1 <= month <= 12 or user_code not in (1, 2) or not 1 <= number <= 999:
        raise ValueError("Komponen nomor invoice tidak valid")
    return f"P{month:02d}{year:04d}{user_code}{number:03d}"


def validate_invoice_period(invoice_no: str, transaction_date: datetime, user_code: int | None = None) -> None:
    match = INVOICE_RE.fullmatch(invoice_no)
    if not match:
        raise HTTPException(422, "Format invoice harus PBBTTTTUNNN, contoh admin P1020261001.")
    if int(match["month"]) != transaction_date.month or int(match["year"]) != transaction_date.year:
        raise HTTPException(422, "Bulan dan tahun invoice harus sama dengan tanggal transaksi.")
    if user_code is not None and int(match["user_code"]) != user_code:
        raise HTTPException(422, "Kode user pada invoice tidak sesuai dengan akun yang sedang login.")


def last_invoice_number(db: Session, business_id: int, user_code: int, year: int, month: int) -> int:
    prefix = f"P{month:02d}{year:04d}{user_code}"
    invoice_numbers = db.scalars(select(Sale.invoice_no).where(
        Sale.business_id == business_id,
        Sale.invoice_no.like(f"{prefix}%"),
    )).all()
    return max((
        int(match["number"])
        for value in invoice_numbers
        if (match := INVOICE_RE.fullmatch(value)) and int(match["user_code"]) == user_code
    ), default=0)


def next_invoice_state(db: Session, user: User, year: int, month: int) -> dict:
    user_code = invoice_user_code(user)
    last_number = last_invoice_number(db, user.business_id, user_code, year, month)
    if last_number >= 999:
        raise HTTPException(409, "Nomor invoice user untuk bulan ini telah mencapai 999.")
    return {
        "user_code": user_code,
        "year": year,
        "month": month,
        "last_number": last_number,
        "invoice_no": format_invoice(year, month, user_code, last_number + 1),
    }


def next_online_invoice(db: Session, user: User, when: datetime) -> str:
    return next_invoice_state(db, user, when.year, when.month)["invoice_no"]
