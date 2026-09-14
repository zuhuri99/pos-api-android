from datetime import datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from zoneinfo import ZoneInfo


WIB = ZoneInfo("Asia/Jakarta")


def normalize_wib(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=WIB)
    return value.astimezone(WIB)


class LoginRequest(BaseModel):
    username: str
    password: str
    device_id: str | None = None
    device_type: Literal["web", "android"] = "web"


class LogoutRequest(BaseModel):
    pin: str | None = Field(default=None, min_length=4, max_length=64, exclude=True)


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

    @field_validator("paid_on")
    @classmethod
    def paid_on_in_wib(cls, value):
        return normalize_wib(value)


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

    @field_validator("transaction_date")
    @classmethod
    def transaction_date_in_wib(cls, value):
        return normalize_wib(value)


class SaleDelete(BaseModel):
    reason: str = Field(default="Transaksi salah", min_length=3, max_length=500)
    pin: str | None = Field(default=None, min_length=4, max_length=64, exclude=True)


class SaleMark(BaseModel):
    mark_type: Literal["wrong", "other"]
    reason: str | None = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def validate_reason(self):
        reason = (self.reason or "").strip()
        if self.mark_type == "other" and len(reason) < 3:
            raise ValueError("Alasan lainnya wajib diisi minimal 3 karakter.")
        self.reason = "Transaksi salah" if self.mark_type == "wrong" else reason
        return self


class ContactCreate(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    mobile: str | None = Field(default=None, max_length=40)

    @model_validator(mode="after")
    def clean_values(self):
        self.name = self.name.strip()
        if len(self.name) < 2:
            raise ValueError("Nama customer wajib diisi minimal 2 karakter.")
        self.mobile = (self.mobile or "").strip() or None
        return self


class SyncOperationIn(BaseModel):
    operation_id: UUID
    entity: Literal["sale"]
    action: Literal["create", "update", "delete", "mark"]
    entity_id: UUID
    base_revision: int = 0
    payload: SaleCreate | SaleMark | SaleDelete


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
    rows: list[ProductImportRow] = Field(min_length=1, max_length=2_000)
