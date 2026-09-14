from datetime import datetime
from decimal import Decimal
from uuid import uuid4

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    JSON,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .core.db import Base


def uuid_string() -> str:
    return str(uuid4())


class Business(Base):
    __tablename__ = "businesses"
    id: Mapped[int] = mapped_column(primary_key=True)
    uuid: Mapped[str] = mapped_column(String(36), unique=True, default=uuid_string)
    name: Mapped[str] = mapped_column(String(160))
    timezone: Mapped[str] = mapped_column(String(64), default="Asia/Jakarta")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id"), index=True)
    username: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=True)


class AccessToken(Base):
    __tablename__ = "access_tokens"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    digest: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    device_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Location(Base):
    __tablename__ = "locations"
    id: Mapped[int] = mapped_column(primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id"), index=True)
    uuid: Mapped[str] = mapped_column(String(36), unique=True, default=uuid_string)
    name: Mapped[str] = mapped_column(String(160))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    revision: Mapped[int] = mapped_column(Integer, default=1)


class Contact(Base):
    __tablename__ = "contacts"
    id: Mapped[int] = mapped_column(primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id"), index=True)
    uuid: Mapped[str] = mapped_column(String(36), unique=True, default=uuid_string)
    name: Mapped[str] = mapped_column(String(160), index=True)
    mobile: Mapped[str | None] = mapped_column(String(40), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    revision: Mapped[int] = mapped_column(Integer, default=1)


class Product(Base):
    __tablename__ = "products"
    id: Mapped[int] = mapped_column(primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id"), index=True)
    uuid: Mapped[str] = mapped_column(String(36), unique=True, default=uuid_string)
    name: Mapped[str] = mapped_column(String(200), index=True)
    sku: Mapped[str] = mapped_column(String(100))
    category: Mapped[str | None] = mapped_column(String(120), nullable=True)
    enable_stock: Mapped[bool] = mapped_column(Boolean, default=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    revision: Mapped[int] = mapped_column(Integer, default=1)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    variations: Mapped[list["ProductVariation"]] = relationship(back_populates="product", cascade="all, delete-orphan")
    __table_args__ = (UniqueConstraint("business_id", "sku", name="uq_product_business_sku"),)


class ProductVariation(Base):
    __tablename__ = "product_variations"
    id: Mapped[int] = mapped_column(primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id"), index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), index=True)
    uuid: Mapped[str] = mapped_column(String(36), unique=True, default=uuid_string)
    name: Mapped[str] = mapped_column(String(160), default="DUMMY")
    sku: Mapped[str] = mapped_column(String(100), index=True)
    selling_price: Mapped[Decimal] = mapped_column(Numeric(18, 4), default=0)
    revision: Mapped[int] = mapped_column(Integer, default=1)
    product: Mapped[Product] = relationship(back_populates="variations")
    balances: Mapped[list["InventoryBalance"]] = relationship(back_populates="variation", cascade="all, delete-orphan")
    __table_args__ = (UniqueConstraint("business_id", "sku", name="uq_variation_business_sku"),)


class InventoryBalance(Base):
    __tablename__ = "inventory_balances"
    id: Mapped[int] = mapped_column(primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id"), index=True)
    location_id: Mapped[int] = mapped_column(ForeignKey("locations.id"), index=True)
    variation_id: Mapped[int] = mapped_column(ForeignKey("product_variations.id"), index=True)
    quantity: Mapped[Decimal] = mapped_column(Numeric(18, 4), default=0)
    revision: Mapped[int] = mapped_column(Integer, default=1)
    variation: Mapped[ProductVariation] = relationship(back_populates="balances")
    __table_args__ = (UniqueConstraint("location_id", "variation_id", name="uq_inventory_location_variation"),)


class StockMovement(Base):
    __tablename__ = "stock_movements"
    id: Mapped[int] = mapped_column(BigInteger().with_variant(Integer, "sqlite"), primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id"), index=True)
    location_id: Mapped[int] = mapped_column(ForeignKey("locations.id"), index=True)
    variation_id: Mapped[int] = mapped_column(ForeignKey("product_variations.id"), index=True)
    sale_uuid: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    quantity_delta: Mapped[Decimal] = mapped_column(Numeric(18, 4))
    reason: Mapped[str] = mapped_column(String(40))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class InvoiceCounter(Base):
    __tablename__ = "invoice_counters"
    id: Mapped[int] = mapped_column(primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id"), index=True)
    period: Mapped[str] = mapped_column(String(6))  # YYYYMM
    last_number: Mapped[int] = mapped_column(Integer, default=0)
    __table_args__ = (UniqueConstraint("business_id", "period", name="uq_invoice_counter_period"),)


class InvoiceReservation(Base):
    __tablename__ = "invoice_reservations"
    id: Mapped[int] = mapped_column(primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id"), index=True)
    device_id: Mapped[str] = mapped_column(String(120), index=True)
    period: Mapped[str] = mapped_column(String(6))
    start_number: Mapped[int] = mapped_column(Integer)
    end_number: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Sale(Base):
    __tablename__ = "sales"
    id: Mapped[int] = mapped_column(primary_key=True)
    uuid: Mapped[str] = mapped_column(String(36), unique=True, default=uuid_string)
    client_transaction_id: Mapped[str] = mapped_column(String(36), unique=True, index=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id"), index=True)
    location_id: Mapped[int] = mapped_column(ForeignKey("locations.id"), index=True)
    contact_id: Mapped[int] = mapped_column(ForeignKey("contacts.id"), index=True)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    device_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    invoice_no: Mapped[str] = mapped_column(String(32), index=True)
    transaction_date: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(20), default="final")
    payment_status: Mapped[str] = mapped_column(String(20), default="due")
    discount_type: Mapped[str] = mapped_column(String(20), default="fixed")
    discount_amount: Mapped[Decimal] = mapped_column(Numeric(18, 4), default=0)
    shipping_charges: Mapped[Decimal] = mapped_column(Numeric(18, 4), default=0)
    packing_charge: Mapped[Decimal] = mapped_column(Numeric(18, 4), default=0)
    change_return: Mapped[Decimal] = mapped_column(Numeric(18, 4), default=0)
    subtotal: Mapped[Decimal] = mapped_column(Numeric(18, 4), default=0)
    final_total: Mapped[Decimal] = mapped_column(Numeric(18, 4), default=0)
    sale_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    revision: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    voided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    voided_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    void_reason: Mapped[str | None] = mapped_column(String(500), nullable=True)
    lines: Mapped[list["SaleLine"]] = relationship(cascade="all, delete-orphan")
    payments: Mapped[list["Payment"]] = relationship(cascade="all, delete-orphan")
    __table_args__ = (UniqueConstraint("business_id", "invoice_no", name="uq_sale_business_invoice"),)


class SaleLine(Base):
    __tablename__ = "sale_lines"
    id: Mapped[int] = mapped_column(primary_key=True)
    sale_id: Mapped[int] = mapped_column(ForeignKey("sales.id"), index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"))
    variation_id: Mapped[int] = mapped_column(ForeignKey("product_variations.id"))
    product_name: Mapped[str] = mapped_column(String(200))
    variation_name: Mapped[str] = mapped_column(String(160), default="")
    quantity: Mapped[Decimal] = mapped_column(Numeric(18, 4))
    unit_price: Mapped[Decimal] = mapped_column(Numeric(18, 4))
    discount_type: Mapped[str] = mapped_column(String(20), default="fixed")
    discount_amount: Mapped[Decimal] = mapped_column(Numeric(18, 4), default=0)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)


class Payment(Base):
    __tablename__ = "payments"
    id: Mapped[int] = mapped_column(primary_key=True)
    sale_id: Mapped[int] = mapped_column(ForeignKey("sales.id"), index=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 4))
    method: Mapped[str] = mapped_column(String(40))
    paid_on: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    account_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)


class SyncOperation(Base):
    __tablename__ = "sync_operations"
    operation_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id"), index=True)
    device_id: Mapped[str] = mapped_column(String(120), index=True)
    entity_type: Mapped[str] = mapped_column(String(40))
    entity_uuid: Mapped[str] = mapped_column(String(36))
    result: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ChangeLog(Base):
    __tablename__ = "change_log"
    sequence: Mapped[int] = mapped_column(BigInteger().with_variant(Integer, "sqlite"), primary_key=True, autoincrement=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id"), index=True)
    entity_type: Mapped[str] = mapped_column(String(40), index=True)
    entity_uuid: Mapped[str] = mapped_column(String(36), index=True)
    action: Mapped[str] = mapped_column(String(20), default="upsert")
    revision: Mapped[int] = mapped_column(Integer, default=1)
    payload: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
