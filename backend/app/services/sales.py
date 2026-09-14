from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from ..models import (
    ChangeLog,
    Contact,
    InventoryBalance,
    Payment,
    Product,
    ProductVariation,
    Location,
    Sale,
    SaleLine,
    StockMovement,
    User,
)
from ..schemas import SaleCreate
from .invoices import next_online_invoice, validate_invoice_period, validate_invoice_reservation


def money(value) -> Decimal:
    return Decimal(str(value or 0)).quantize(Decimal("0.0001"))


def serialize_sale(sale: Sale, contact_name: str | None = None) -> dict:
    payments = [
        {
            "payment_id": payment.id,
            "amount": str(payment.amount),
            "method": payment.method,
            "paid_on": payment.paid_on.isoformat(sep=" "),
            "account_id": payment.account_id,
            "note": payment.note,
        }
        for payment in sale.payments
    ]
    return {
        "id": sale.id,
        "uuid": sale.uuid,
        "client_transaction_id": sale.client_transaction_id,
        "location_id": sale.location_id,
        "contact_id": sale.contact_id,
        "contact": contact_name or "Umum",
        "invoice_no": sale.invoice_no,
        "transaction_date": sale.transaction_date.isoformat(sep=" "),
        "status": sale.status,
        "payment_status": sale.payment_status,
        "discount_type": sale.discount_type,
        "discount_amount": str(sale.discount_amount),
        "shipping_charges": str(sale.shipping_charges),
        "packing_charge": str(sale.packing_charge),
        "change_return": str(sale.change_return),
        "total_before_tax": str(sale.subtotal),
        "final_total": str(sale.final_total),
        "sale_note": sale.sale_note,
        "revision": sale.revision,
        "products": [
            {
                "sell_line_id": line.id,
                "product_id": line.product_id,
                "variation_id": line.variation_id,
                "product_name": line.product_name,
                "variation_name": line.variation_name,
                "quantity": str(line.quantity),
                "unit_price": str(line.unit_price),
                "discount_type": line.discount_type,
                "discount_amount": str(line.discount_amount),
                "note": line.note,
            }
            for line in sale.lines
        ],
        "sell_lines": [
            {
                "id": line.id,
                "product_id": line.product_id,
                "variation_id": line.variation_id,
                "quantity": str(line.quantity),
                "unit_price": str(line.unit_price),
                "unit_price_inc_tax": str(line.unit_price),
                "line_discount_type": line.discount_type,
                "line_discount_amount": str(line.discount_amount),
                "sell_line_note": line.note,
                "product_name": line.product_name,
                "variation_name": line.variation_name,
                "product": {"name": line.product_name},
                "variations": {"name": line.variation_name},
            }
            for line in sale.lines
        ],
        "payments": payments,
        "payment_lines": payments,
        "tax_amount": "0.0000",
    }


def get_sale(db: Session, business_id: int, sale_id: int) -> Sale:
    sale = db.execute(
        select(Sale)
        .options(joinedload(Sale.lines), joinedload(Sale.payments))
        .where(Sale.business_id == business_id, Sale.id == sale_id)
    ).unique().scalar_one_or_none()
    if not sale:
        raise HTTPException(404, "Transaksi tidak ditemukan.")
    return sale


def create_sale(db: Session, user: User, data: SaleCreate) -> Sale:
    existing = db.scalar(select(Sale).where(Sale.client_transaction_id == str(data.client_transaction_id)))
    if existing:
        return get_sale(db, user.business_id, existing.id)

    contact = db.scalar(select(Contact).where(Contact.id == data.contact_id, Contact.business_id == user.business_id))
    if not contact:
        raise HTTPException(422, "Customer tidak ditemukan.")
    if not db.scalar(select(Location.id).where(Location.id == data.location_id, Location.business_id == user.business_id, Location.is_active.is_(True))):
        raise HTTPException(422, "Lokasi tidak ditemukan atau tidak aktif.")

    invoice_no = data.invoice_no or next_online_invoice(db, user.business_id, data.transaction_date)
    validate_invoice_period(invoice_no, data.transaction_date)
    if data.invoice_no:
        validate_invoice_reservation(db, user.business_id, data.device_id, invoice_no)
    if db.scalar(select(Sale.id).where(Sale.business_id == user.business_id, Sale.invoice_no == invoice_no)):
        raise HTTPException(409, {"code": "duplicate_invoice", "invoice_no": invoice_no})
    subtotal = Decimal("0")
    prepared_lines = []
    locked_balances = []
    for item in data.products:
        variation = db.scalar(
            select(ProductVariation)
            .options(joinedload(ProductVariation.product))
            .where(ProductVariation.id == item.variation_id)
        )
        if not variation or variation.product.business_id != user.business_id or variation.product_id != item.product_id:
            raise HTTPException(422, f"Produk/variasi {item.variation_id} tidak ditemukan.")
        gross = money(item.quantity * item.unit_price)
        discount = money(gross * item.discount_amount / 100) if item.discount_type == "percentage" else money(item.discount_amount)
        subtotal += max(Decimal("0"), gross - discount)
        prepared_lines.append((item, variation))
        if data.status == "final" and variation.product.enable_stock:
            balance = db.scalar(
                select(InventoryBalance)
                .where(InventoryBalance.location_id == data.location_id, InventoryBalance.variation_id == variation.id)
                .with_for_update()
            )
            if not balance or balance.quantity < item.quantity:
                raise HTTPException(409, {"code": "insufficient_stock", "variation_id": variation.id})
            locked_balances.append((balance, item.quantity))

    transaction_discount = money(subtotal * data.discount_amount / 100) if data.discount_type == "percentage" else money(data.discount_amount)
    total = max(Decimal("0"), subtotal - transaction_discount + data.shipping_charges + data.packing_charge)
    paid = sum((money(item.amount) for item in data.payments), Decimal("0"))
    payment_status = "paid" if paid >= total else "partial" if paid > 0 else "due"
    sale = Sale(
        client_transaction_id=str(data.client_transaction_id), business_id=user.business_id,
        location_id=data.location_id, contact_id=data.contact_id, created_by=user.id,
        device_id=data.device_id, invoice_no=invoice_no, transaction_date=data.transaction_date,
        status=data.status, payment_status=payment_status, discount_type=data.discount_type,
        discount_amount=data.discount_amount, shipping_charges=data.shipping_charges,
        packing_charge=data.packing_charge, change_return=data.change_return,
        subtotal=money(subtotal), final_total=money(total), sale_note=data.sale_note,
    )
    db.add(sale)
    db.flush()
    for item, variation in prepared_lines:
        sale.lines.append(SaleLine(
            product_id=item.product_id, variation_id=item.variation_id,
            product_name=variation.product.name, variation_name=variation.name,
            quantity=item.quantity, unit_price=item.unit_price,
            discount_type=item.discount_type, discount_amount=item.discount_amount, note=item.note,
        ))
    for item in data.payments:
        sale.payments.append(Payment(
            amount=item.amount, method=item.method, paid_on=item.paid_on or data.transaction_date,
            account_id=item.account_id, note=item.note,
        ))
    if data.status == "final":
        for balance, quantity in locked_balances:
            balance.quantity -= quantity
            balance.revision += 1
            db.add(StockMovement(
                business_id=user.business_id, location_id=data.location_id,
                variation_id=balance.variation_id, sale_uuid=sale.uuid,
                quantity_delta=-quantity, reason="sale",
            ))
            db.add(ChangeLog(
                business_id=user.business_id,
                entity_type="inventory",
                entity_uuid=f"{balance.location_id}:{balance.variation_id}",
                action="upsert",
                revision=balance.revision,
                payload={
                    "location_id": balance.location_id,
                    "variation_id": balance.variation_id,
                    "quantity": str(balance.quantity),
                    "revision": balance.revision,
                },
            ))
    db.flush()
    payload = serialize_sale(sale, contact.name)
    db.add(ChangeLog(
        business_id=user.business_id, entity_type="sale", entity_uuid=sale.uuid,
        action="upsert", revision=sale.revision, payload=payload,
    ))
    db.flush()
    return get_sale(db, user.business_id, sale.id)


def update_draft_sale(db: Session, user: User, data: SaleCreate) -> Sale:
    sale = db.execute(
        select(Sale).options(joinedload(Sale.lines), joinedload(Sale.payments)).where(
            Sale.business_id == user.business_id,
            Sale.client_transaction_id == str(data.client_transaction_id),
        )
    ).unique().scalar_one_or_none()
    if not sale:
        raise HTTPException(404, "Draft transaksi tidak ditemukan.")
    if sale.status != "draft":
        raise HTTPException(409, "Transaksi final tidak dapat diedit. Gunakan void atau transaksi koreksi.")
    # Draft belum mengubah stok. Rebuild melalui jalur create yang sama dengan
    # client id sementara agar seluruh validasi harga/stok tetap satu tempat.
    original_id = str(data.client_transaction_id)
    db.delete(sale)
    db.flush()
    replacement = create_sale(db, user, data.model_copy(update={"client_transaction_id": original_id}))
    replacement.revision = sale.revision + 1
    db.flush()
    return replacement
