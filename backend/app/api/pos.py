from datetime import datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_, select
from sqlalchemy.orm import Session, joinedload

from ..core.db import get_db
from ..models import Contact, InventoryBalance, Location, Product, ProductVariation, Sale, User
from ..schemas import InvoiceReservationRequest, SaleCreate, SaleDelete
from ..services.invoices import reserve_invoice_numbers
from ..services.sales import create_sale, get_sale, serialize_sale, update_sale, void_sale
from .deps import current_user

router = APIRouter(prefix="/api/v1", tags=["pos"])


def product_payload(product: Product, location_id: int | None) -> dict:
    variations = []
    for variation in product.variations:
        balances = [balance for balance in variation.balances if location_id is None or balance.location_id == location_id]
        variations.append({
            "id": variation.id,
            "name": variation.name,
            "sub_sku": variation.sku,
            "default_sell_price": str(variation.selling_price),
            "sell_price_inc_tax": str(variation.selling_price),
            "variation_location_details": [
                {"location_id": balance.location_id, "qty_available": str(balance.quantity)}
                for balance in balances
            ],
        })
    return {
        "id": product.id, "uuid": product.uuid, "name": product.name, "sku": product.sku,
        "enable_stock": 1 if product.enable_stock else 0, "is_inactive": 0 if product.is_active else 1,
        "category": product.category, "revision": product.revision,
        "product_variations": [{"id": product.id, "name": "DUMMY", "variations": variations}],
    }


@router.get("/income/pos/bootstrap")
def bootstrap(user: User = Depends(current_user), db: Session = Depends(get_db)):
    locations = db.scalars(select(Location).where(Location.business_id == user.business_id, Location.is_active.is_(True))).all()
    return {"data": {
        "source_user": user.username,
        "available_sources": [{"value": user.username, "label": user.username}],
        "locations": [{"id": row.id, "name": row.name} for row in locations],
        "payment_methods": [
            {"name": "cash", "label": "Tunai"},
            {"name": "bank_transfer", "label": "Transfer/QRIS"},
            {"name": "other", "label": "Lainnya"},
        ],
    }}


@router.get("/income/pos/products")
def products(
    name: str | None = None, sku: str | None = None, location_id: int | None = None,
    per_page: int = Query(default=50, ge=1, le=500),
    user: User = Depends(current_user), db: Session = Depends(get_db),
):
    query = select(Product).options(joinedload(Product.variations).joinedload(ProductVariation.balances)).where(
        Product.business_id == user.business_id, Product.is_active.is_(True)
    )
    if name:
        query = query.where(Product.name.ilike(f"%{name}%"))
    if sku:
        query = query.join(Product.variations).where(or_(Product.sku.ilike(f"%{sku}%"), ProductVariation.sku.ilike(f"%{sku}%")))
    rows = db.scalars(query.limit(per_page)).unique().all()
    return {"data": [product_payload(row, location_id) for row in rows]}


@router.get("/income/pos/contacts")
def contacts(
    per_page: int = Query(default=100, ge=1, le=500),
    user: User = Depends(current_user), db: Session = Depends(get_db),
):
    rows = db.scalars(select(Contact).where(Contact.business_id == user.business_id, Contact.is_active.is_(True)).limit(per_page)).all()
    return {"data": [{"id": row.id, "uuid": row.uuid, "name": row.name, "mobile": row.mobile, "revision": row.revision} for row in rows]}


@router.get("/pos-data/product-stock-report")
def stock_report(
    location_id: int | None = None, user: User = Depends(current_user), db: Session = Depends(get_db)
):
    query = (
        select(InventoryBalance, ProductVariation, Product)
        .join(ProductVariation, InventoryBalance.variation_id == ProductVariation.id)
        .join(Product, ProductVariation.product_id == Product.id)
        .where(Product.business_id == user.business_id)
    )
    if location_id:
        query = query.where(InventoryBalance.location_id == location_id)
    return {"data": [{
        "stock": str(balance.quantity), "sku": variation.sku, "product": product.name,
        "product_id": product.id, "enable_stock": 1 if product.enable_stock else 0,
        "unit_price": str(variation.selling_price), "product_variation": variation.name,
        "variation_name": variation.name, "location_id": balance.location_id,
        "variation_id": variation.id,
    } for balance, variation, product in db.execute(query).all()]}


@router.post("/income/pos/invoice-numbers/reserve")
def reserve_numbers(payload: InvoiceReservationRequest, user: User = Depends(current_user), db: Session = Depends(get_db)):
    numbers = reserve_invoice_numbers(db, user.business_id, payload.device_id, payload.year, payload.month, payload.count)
    db.commit()
    return {"data": {"numbers": numbers, "count": len(numbers)}}


@router.post("/income/pos/transactions")
def create_transaction(payload: SaleCreate, user: User = Depends(current_user), db: Session = Depends(get_db)):
    sale = create_sale(db, user, payload)
    db.commit()
    return {"success": True, "data": serialize_sale(sale)}


@router.get("/income/pos/transactions")
def transactions(
    year: int | None = Query(default=None, ge=2020, le=9999),
    search: str | None = Query(default=None, max_length=100),
    limit: int = Query(default=200, ge=1, le=500),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    query = (
        select(Sale)
        .options(joinedload(Sale.lines), joinedload(Sale.payments))
        .where(Sale.business_id == user.business_id, Sale.status != "void")
    )
    if year:
        query = query.where(
            Sale.transaction_date >= datetime(year, 1, 1),
            Sale.transaction_date < datetime(year + 1, 1, 1),
        )
    if search and search.strip():
        query = query.where(Sale.invoice_no.ilike(f"%{search.strip()}%"))
    rows = db.scalars(query.order_by(Sale.transaction_date.desc()).limit(limit)).unique().all()
    contact_ids = {row.contact_id for row in rows}
    location_ids = {row.location_id for row in rows}
    contact_names = dict(db.execute(select(Contact.id, Contact.name).where(Contact.id.in_(contact_ids))).all()) if contact_ids else {}
    location_names = dict(db.execute(select(Location.id, Location.name).where(Location.id.in_(location_ids))).all()) if location_ids else {}
    data = []
    for row in rows:
        item = serialize_sale(row, contact_names.get(row.contact_id))
        item["location_name"] = location_names.get(row.location_id, "-")
        item["_source_user"] = user.username
        data.append(item)
    return {"success": True, "data": data}


@router.put("/income/pos/transactions/{sale_id}")
def update_transaction(sale_id: int, payload: SaleCreate, user: User = Depends(current_user), db: Session = Depends(get_db)):
    current = get_sale(db, user.business_id, sale_id)
    payload = payload.model_copy(update={
        "client_transaction_id": current.client_transaction_id,
        "location_id": current.location_id,
        "invoice_no": current.invoice_no,
    })
    sale = update_sale(db, user, payload)
    db.commit()
    return {"success": True, "data": serialize_sale(sale)}


@router.get("/income/pos/transactions/{sale_id}")
def transaction(sale_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    sale = get_sale(db, user.business_id, sale_id)
    contact = db.get(Contact, sale.contact_id)
    return {"success": True, "data": serialize_sale(sale, contact.name if contact else None)}


@router.get("/income/pos/transactions/{sale_id}/invoice")
def invoice(sale_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    sale = get_sale(db, user.business_id, sale_id)
    contact = db.get(Contact, sale.contact_id)
    data = serialize_sale(sale, contact.name if contact else None)
    data["_source_user"] = user.username
    return {"success": True, "data": data}


@router.delete("/income/pos/transactions/{sale_id}")
def delete_transaction(
    sale_id: int,
    payload: SaleDelete | None = None,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    sale = get_sale(db, user.business_id, sale_id)
    sale = void_sale(db, user, sale, (payload or SaleDelete()).reason)
    db.commit()
    return {"success": True, "data": serialize_sale(sale)}


@router.get("/income/lite")
def income_lite(
    start_date: datetime | None = None, end_date: datetime | None = None,
    user: User = Depends(current_user), db: Session = Depends(get_db),
):
    query = select(Sale).where(Sale.business_id == user.business_id, Sale.status != "void")
    if start_date:
        query = query.where(Sale.transaction_date >= start_date)
    if end_date:
        query = query.where(Sale.transaction_date <= end_date)
    rows = db.scalars(query.order_by(Sale.transaction_date.desc())).all()
    return {"data": {user.username: [{"id": row.id, "invoice_no": row.invoice_no} for row in rows]}}


@router.post("/income/pos/qris-url")
def qris_unconfigured(user: User = Depends(current_user)):
    raise HTTPException(503, "QRIS belum dikonfigurasi pada backend POS mandiri.")
