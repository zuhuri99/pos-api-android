import re
from datetime import datetime

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..models import InvoiceCounter, InvoiceReservation

INVOICE_RE = re.compile(r"^P(?P<month>\d{2})(?P<year>\d{4})(?P<number>\d{4})$")


def format_invoice(year: int, month: int, number: int) -> str:
    if not 1 <= month <= 12 or not 1 <= number <= 9999:
        raise ValueError("Komponen nomor invoice tidak valid")
    return f"P{month:02d}{year:04d}{number:04d}"


def validate_invoice_period(invoice_no: str, transaction_date: datetime) -> None:
    match = INVOICE_RE.fullmatch(invoice_no)
    if not match:
        raise HTTPException(422, "Format invoice harus PBBTTTTNNNN, contoh P1020260001.")
    if int(match["month"]) != transaction_date.month or int(match["year"]) != transaction_date.year:
        raise HTTPException(422, "Bulan dan tahun invoice harus sama dengan tanggal transaksi.")


def validate_invoice_reservation(
    db: Session, business_id: int, device_id: str | None, invoice_no: str
) -> None:
    if not device_id:
        raise HTTPException(422, "device_id wajib diisi jika nomor invoice dikirim oleh klien.")
    match = INVOICE_RE.fullmatch(invoice_no)
    if not match:
        return
    period = f"{match['year']}{match['month']}"
    number = int(match["number"])
    reservation = db.scalar(select(InvoiceReservation).where(
        InvoiceReservation.business_id == business_id,
        InvoiceReservation.device_id == device_id,
        InvoiceReservation.period == period,
        InvoiceReservation.start_number <= number,
        InvoiceReservation.end_number >= number,
    ))
    if not reservation:
        raise HTTPException(409, {
            "code": "invoice_not_reserved",
            "message": "Nomor invoice tidak dialokasikan untuk perangkat ini.",
        })


def reserve_invoice_numbers(
    db: Session, business_id: int, device_id: str, year: int, month: int, count: int
) -> list[str]:
    period = f"{year:04d}{month:02d}"
    counter = db.scalar(
        select(InvoiceCounter)
        .where(InvoiceCounter.business_id == business_id, InvoiceCounter.period == period)
        .with_for_update()
    )
    if counter is None:
        counter = InvoiceCounter(business_id=business_id, period=period, last_number=0)
        db.add(counter)
        try:
            db.flush()
        except IntegrityError:
            db.rollback()
            counter = db.scalar(
                select(InvoiceCounter)
                .where(InvoiceCounter.business_id == business_id, InvoiceCounter.period == period)
                .with_for_update()
            )
    start = counter.last_number + 1
    end = counter.last_number + count
    if end > 9999:
        raise HTTPException(409, "Nomor invoice bulan ini telah mencapai 9999.")
    counter.last_number = end
    db.add(InvoiceReservation(
        business_id=business_id,
        device_id=device_id,
        period=period,
        start_number=start,
        end_number=end,
    ))
    db.flush()
    return [format_invoice(year, month, value) for value in range(start, end + 1)]


def next_online_invoice(db: Session, business_id: int, when: datetime) -> str:
    return reserve_invoice_numbers(db, business_id, "server", when.year, when.month, 1)[0]
