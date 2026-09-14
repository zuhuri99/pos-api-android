from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from ..core.db import get_db
from ..models import ChangeLog, Contact, Location, Product, ProductVariation, SyncOperation, User
from ..schemas import SyncPushRequest
from ..services.sales import create_sale, update_draft_sale
from .deps import current_user
from .pos import product_payload

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
        "contacts": [{"id": row.id, "uuid": row.uuid, "name": row.name, "mobile": row.mobile, "revision": row.revision} for row in contacts],
        "locations": [{"id": row.id, "uuid": row.uuid, "name": row.name, "revision": row.revision} for row in locations],
    }}


@router.post("/push")
def push(payload: SyncPushRequest, user: User = Depends(current_user), db: Session = Depends(get_db)):
    results = []
    for operation in payload.operations:
        operation_id = str(operation.operation_id)
        existing = db.get(SyncOperation, operation_id)
        if existing:
            results.append(existing.result)
            continue
        sale_payload = operation.payload.model_copy(update={
            "client_transaction_id": operation.entity_id,
            "device_id": payload.device_id,
        })
        sale = update_draft_sale(db, user, sale_payload) if operation.action == "update" else create_sale(db, user, sale_payload)
        result = {
            "operation_id": operation_id, "status": "applied", "entity": "sale",
            "entity_id": str(operation.entity_id), "server_id": sale.id,
            "invoice_no": sale.invoice_no, "revision": sale.revision,
        }
        db.add(SyncOperation(
            operation_id=operation_id, business_id=user.business_id, device_id=payload.device_id,
            entity_type="sale", entity_uuid=str(operation.entity_id), result=result,
        ))
        results.append(result)
    db.commit()
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
