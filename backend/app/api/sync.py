from fastapi import APIRouter, BackgroundTasks, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from ..core.db import get_db
from ..models import ChangeLog, Contact, Location, Product, ProductVariation, Sale, SyncOperation, User
from ..schemas import SaleCreate, SaleDelete, SaleMark, SyncPushRequest
from ..services.sales import create_sale, mark_sale, serialize_sale, update_sale, void_sale
from ..services.notifications import queue_transaction_notifications
from .deps import authorize_sale_delete, current_user
from .pos import contact_payload, product_payload

router = APIRouter(prefix="/api/v1/sync", tags=["sync"])


@router.get("/bootstrap")
def sync_bootstrap(user: User = Depends(current_user), db: Session = Depends(get_db)):
    products = db.scalars(
        select(Product).options(joinedload(Product.variations).joinedload(ProductVariation.balances))
        .where(Product.business_id == user.business_id, Product.is_active.is_(True))
    ).unique().all()
    contacts = db.scalars(select(Contact).where(Contact.business_id == user.business_id, Contact.is_active.is_(True))).all()
    locations = db.scalars(select(Location).where(Location.business_id == user.business_id, Location.is_active.is_(True))).all()
    cursor = db.scalar(select(func.max(ChangeLog.sequence)).where(ChangeLog.business_id == user.business_id)) or 0
    return {"data": {
        "cursor": cursor,
        "products": [product_payload(row, None) for row in products],
        "contacts": [contact_payload(row) for row in contacts],
        "locations": [{"id": row.id, "uuid": row.uuid, "name": row.name, "revision": row.revision} for row in locations],
    }}


@router.post("/push")
def push(
    payload: SyncPushRequest,
    background_tasks: BackgroundTasks,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    results = []
    notifications = []
    for operation in payload.operations:
        operation_id = str(operation.operation_id)
        existing = db.get(SyncOperation, operation_id)
        if existing:
            results.append(existing.result)
            continue
        if operation.action in {"delete", "mark"}:
            action_payload = operation.payload
            sale = db.scalar(select(Sale).where(
                Sale.business_id == user.business_id,
                Sale.client_transaction_id == str(operation.entity_id),
            ))
            if not sale:
                raise ValueError("Transaksi belum tersedia di server.")
            if operation.action == "delete":
                if not isinstance(action_payload, SaleDelete):
                    raise ValueError("Payload penghapusan transaksi tidak valid.")
                authorize_sale_delete(user, action_payload.pin)
                sale = void_sale(db, user, sale, action_payload.reason)
            else:
                if not isinstance(action_payload, SaleMark):
                    raise ValueError("Payload penandaan transaksi tidak valid.")
                sale = mark_sale(db, user, sale, action_payload)
        else:
            sale_payload = operation.payload
            if not isinstance(sale_payload, SaleCreate):
                raise ValueError("Payload transaksi tidak valid.")
            sale_payload = sale_payload.model_copy(update={
                "client_transaction_id": operation.entity_id,
                "device_id": payload.device_id,
            })
            sale = update_sale(db, user, sale_payload) if operation.action == "update" else create_sale(db, user, sale_payload)
        result = {
            "operation_id": operation_id, "status": "applied", "entity": "sale",
            "action": operation.action,
            "entity_id": str(operation.entity_id), "server_id": sale.id,
            "invoice_no": sale.invoice_no, "revision": sale.revision,
        }
        db.add(SyncOperation(
            operation_id=operation_id, business_id=user.business_id, device_id=payload.device_id,
            entity_type="sale", entity_uuid=str(operation.entity_id), result=result,
        ))
        results.append(result)
        if not user.is_admin and operation.action in {"create", "update", "delete", "mark"}:
            contact = db.get(Contact, sale.contact_id)
            notifications.append((
                operation.action,
                serialize_sale(sale, contact.name if contact else None, user.username),
                operation_id,
            ))
    db.commit()
    if notifications:
        queue_transaction_notifications(background_tasks, notifications, user.username)
    return {"data": {"results": results}}


@router.get("/pull")
def pull(cursor: int = 0, limit: int = 500, user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.scalars(
        select(ChangeLog).where(ChangeLog.business_id == user.business_id, ChangeLog.sequence > cursor)
        .order_by(ChangeLog.sequence).limit(min(max(limit, 1), 500))
    ).all()
    return {"data": {
        "cursor": rows[-1].sequence if rows else cursor,
        "changes": [{
            "sequence": row.sequence, "entity": row.entity_type, "entity_id": row.entity_uuid,
            "action": row.action, "revision": row.revision, "data": row.payload,
        } for row in rows],
        "has_more": len(rows) == min(max(limit, 1), 500),
    }}
