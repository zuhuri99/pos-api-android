from datetime import datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field


class LoginRequest(BaseModel):
    username: str
    password: str
    device_id: str | None = None


class ProductLine(BaseModel):
    model_config = ConfigDict(extra="ignore")
    sell_line_id: int | None = None
    product_id: int
    variation_id: int
    quantity: Decimal = Field(gt=0)
    unit_price: Decimal = Field(ge=0)
    tax_rate_id: int = 0
    discount_amount: Decimal = Field(default=0, ge=0)
    discount_type: Literal["fixed", "percentage"] = "fixed"
    note: str | None = None


class PaymentLine(BaseModel):
    model_config = ConfigDict(extra="ignore")
    payment_id: int | None = None
    amount: Decimal = Field(ge=0)
    method: str
    paid_on: datetime | None = None
    account_id: int | None = None
    note: str | None = None


class SaleCreate(BaseModel):
    model_config = ConfigDict(extra="ignore")
    client_transaction_id: UUID = Field(default_factory=uuid4)
    device_id: str | None = None
    location_id: int
    contact_id: int
    invoice_no: str | None = None
    transaction_date: datetime
    status: Literal["final", "draft"] = "final"
    discount_type: Literal["fixed", "percentage"] = "fixed"
    discount_amount: Decimal = Field(default=0, ge=0)
    sale_note: str | None = None
    shipping_charges: Decimal = Field(default=0, ge=0)
    packing_charge: Decimal = Field(default=0, ge=0)
    change_return: Decimal = Field(default=0, ge=0)
    products: list[ProductLine] = Field(min_length=1)
    payments: list[PaymentLine] = Field(default_factory=list)


class SyncOperationIn(BaseModel):
    operation_id: UUID
    entity: Literal["sale"]
    action: Literal["create", "update"]
    entity_id: UUID
    base_revision: int = 0
    payload: SaleCreate


class SyncPushRequest(BaseModel):
    device_id: str
    operations: list[SyncOperationIn] = Field(max_length=100)


class InvoiceReservationRequest(BaseModel):
    device_id: str
    year: int = Field(ge=2020, le=9999)
    month: int = Field(ge=1, le=12)
    count: int = Field(default=100, ge=1, le=500)


class ProductImportRow(BaseModel):
    sku: str
    name: str
    variation_name: str = "DUMMY"
    variation_sku: str | None = None
    selling_price: Decimal = Field(ge=0)
    initial_stock: Decimal = Field(default=0, ge=0)
    category: str | None = None
    enable_stock: bool = True
    is_active: bool = True


class ProductImportCommit(BaseModel):
    location_id: int
    rows: list[ProductImportRow] = Field(min_length=1, max_length=10_000)
