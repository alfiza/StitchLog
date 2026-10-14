from datetime import date, datetime
from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, PlainSerializer, field_validator

from .models import JobStatus, PaymentMethod, PhotoType
from .phone import InvalidPhone, normalise_phone

Money = Annotated[Decimal, PlainSerializer(lambda v: float(v) if v is not None else None, return_type=float)]
MoneyIn = Annotated[Decimal, Field(ge=0, max_digits=10, decimal_places=2)]


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---------- auth ----------
class LoginIn(BaseModel):
    email: str
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "UserOut"


class UserOut(ORM):
    id: int
    email: str
    name: str


# ---------- customers ----------
def _phone(v: str) -> str:
    try:
        return normalise_phone(v)
    except InvalidPhone as e:
        raise ValueError(str(e)) from e


class CustomerBase(BaseModel):
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(default="", max_length=100)
    phone: str
    email: str | None = None
    notes: str = ""
    tags: str = ""
    sms_consent: bool = False
    photo_consent: bool = False

    @field_validator("phone")
    @classmethod
    def _norm_phone(cls, v: str) -> str:
        return _phone(v)

    @field_validator("first_name", "last_name")
    @classmethod
    def _strip(cls, v: str) -> str:
        return v.strip()

    @field_validator("email")
    @classmethod
    def _email(cls, v: str | None) -> str | None:
        v = (v or "").strip()
        return v or None


class CustomerCreate(CustomerBase):
    pass


class CustomerUpdate(BaseModel):
    first_name: str | None = Field(default=None, min_length=1, max_length=100)
    last_name: str | None = None
    phone: str | None = None
    email: str | None = None
    notes: str | None = None
    tags: str | None = None
    sms_consent: bool | None = None
    photo_consent: bool | None = None

    @field_validator("phone")
    @classmethod
    def _norm_phone(cls, v: str | None) -> str | None:
        return _phone(v) if v is not None else None


class CustomerOut(ORM):
    id: int
    first_name: str
    last_name: str
    phone: str
    email: str | None
    notes: str
    tags: str
    sms_consent: bool
    photo_consent: bool
    source: str
    created_at: datetime
    phone_display: str = ""


class CustomerListItem(CustomerOut):
    job_count: int = 0
    open_jobs: int = 0
    last_visit: datetime | None = None


class MeasurementIn(BaseModel):
    label: str = Field(min_length=1, max_length=50)
    value: Annotated[Decimal, Field(ge=0, max_digits=6, decimal_places=1)]
    unit: str = Field(default="cm", max_length=10)


class MeasurementOut(ORM):
    id: int
    label: str
    value: Money
    unit: str
    updated_at: datetime


# ---------- jobs ----------
class PhotoOut(ORM):
    id: int
    type: PhotoType
    url: str
    thumb_url: str
    width: int
    height: int
    alt_text: str


class JobItemIn(BaseModel):
    id: int | None = None  # set when editing an existing item
    garment_type: str = Field(default="Dress", max_length=50)
    colour: str = Field(default="", max_length=50)
    details: str = ""
    original_price: MoneyIn | None = None
    job_price: MoneyIn = Decimal("0")


class JobItemOut(ORM):
    id: int
    position: int
    garment_type: str
    colour: str
    details: str
    original_price: Money | None
    job_price: Money
    photos: list[PhotoOut] = []


class JobCreate(BaseModel):
    customer_id: int
    due_date: date | None = None
    urgent: bool = False
    deposit: MoneyIn = Decimal("0")
    paid: bool = False
    payment_method: PaymentMethod | None = None
    notes: str = ""
    items: list[JobItemIn] = Field(min_length=1)
    notify: bool = True  # send the "we have your job" message with the details


class JobUpdate(BaseModel):
    due_date: date | None = None
    urgent: bool | None = None
    deposit: MoneyIn | None = None
    paid: bool | None = None
    payment_method: PaymentMethod | None = None
    notes: str | None = None
    items: list[JobItemIn] | None = None  # full replacement list when given


class StatusChange(BaseModel):
    status: JobStatus
    notify: bool = True  # send the "ready" message when moving to ready


class MessageOut(ORM):
    id: int
    kind: str = "ready"
    channel: str
    to: str
    body: str
    status: str
    error: str
    sent_at: datetime


class ReviewOut(ORM):
    id: int
    rating: int
    comment: str
    show_on_website: bool
    created_at: datetime


class CustomerMini(ORM):
    id: int
    first_name: str
    last_name: str
    phone: str
    phone_display: str = ""


class JobSummary(ORM):
    id: int
    job_number: str
    status: JobStatus
    due_date: date | None
    urgent: bool
    paid: bool
    deposit: Money
    total_price: Money
    balance_due: Money
    created_at: datetime
    ready_at: datetime | None
    collected_at: datetime | None
    item_count: int = 0
    items_label: str = ""
    customer: CustomerMini | None = None


class JobOut(JobSummary):
    payment_method: PaymentMethod | None
    notes: str
    public_token: str
    public_url: str = ""
    whatsapp_url: str = ""
    whatsapp_received_url: str = ""
    items: list[JobItemOut]
    review: ReviewOut | None
    messages: list[MessageOut]


class CustomerDetail(CustomerOut):
    measurements: list[MeasurementOut]
    jobs: list[JobSummary]


# ---------- services (price list) ----------
class ServiceIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    garment_type: str = ""
    price_from: MoneyIn = Decimal("0")
    description: str = ""
    sort_order: int = 0
    active: bool = True


class ServiceOut(ORM):
    id: int
    name: str
    garment_type: str
    price_from: Money
    description: str
    sort_order: int
    active: bool


# ---------- inventory ----------
Qty = Annotated[Decimal, Field(ge=0, max_digits=10, decimal_places=2)]


Section = Annotated[str, Field(pattern="^(shop|beauty)$")]


class InventoryIn(BaseModel):
    section: Section = "shop"
    name: str = Field(min_length=1, max_length=150)
    category: str = Field(default="Other", max_length=50)
    supplier: str = Field(default="", max_length=120)
    bought_on: date
    quantity: Annotated[Decimal, Field(gt=0, max_digits=10, decimal_places=2)] = Decimal("1")
    quantity_left: Qty | None = None  # defaults to quantity for a new item
    unit: str = Field(default="pcs", max_length=20)
    unit_price: MoneyIn = Decimal("0")
    low_stock_at: Qty | None = None
    buy_url: str = Field(default="", max_length=500)
    image_url: str = Field(default="", max_length=500)
    payment_method: PaymentMethod | None = None
    notes: str = ""

    @field_validator("buy_url", "image_url")
    @classmethod
    def _url(cls, v: str) -> str:
        v = v.strip()
        if v and not v.lower().startswith(("http://", "https://")):
            v = "https://" + v
        return v

    @field_validator("name", "category", "supplier", "unit")
    @classmethod
    def _strip(cls, v: str) -> str:
        return v.strip()


class StockChange(BaseModel):
    change: Annotated[Decimal, Field(max_digits=10, decimal_places=2)]  # -1 = used one, +5 = found 5 more


class InventoryOut(ORM):
    id: int
    section: str
    name: str
    category: str
    supplier: str
    bought_on: date
    quantity: Money
    quantity_left: Money
    unit: str
    unit_price: Money
    total_cost: Money
    stock_value: Money
    stock_status: str
    low_stock_at: Money | None
    buy_url: str = ""
    image_url: str = ""
    payment_method: PaymentMethod | None
    notes: str
    receipt_url: str = ""
    receipt_thumb_url: str = ""
    created_at: datetime


class InventoryPage(BaseModel):
    items: list[InventoryOut]
    total: int
    cost_total: Money  # money spent on the listed items


class CategoryTotal(BaseModel):
    category: str
    total: Money
    count: int


class InventoryOverview(BaseModel):
    stock_value: Money  # value of everything still on the shelf
    item_count: int
    low_count: int
    out_count: int


class SpendSummary(BaseModel):
    """Money spent buying stock in a date range: this is the expenses figure."""

    date_from: date
    date_to: date
    total: Money
    count: int
    by_category: list[CategoryTotal]


# ---------- public ----------
class PublicPhoto(BaseModel):
    type: PhotoType
    url: str
    thumb_url: str
    alt_text: str


class PublicItem(BaseModel):
    garment_type: str
    colour: str
    details: str
    job_price: Money
    photos: list[PublicPhoto]


class PublicBusiness(BaseModel):
    name: str
    phone: str
    whatsapp: str
    address: str
    eircode: str
    opening_hours: str
    google_review_url: str


class PublicJob(BaseModel):
    job_number: str
    status: JobStatus
    first_name: str
    due_date: date | None
    created_at: datetime
    ready_at: datetime | None
    collected_at: datetime | None
    total_price: Money
    balance_due: Money
    paid: bool
    items: list[PublicItem]
    review: ReviewOut | None
    business: PublicBusiness


class ReviewIn(BaseModel):
    rating: int = Field(ge=1, le=5)
    comment: str = Field(default="", max_length=2000)


class ReviewUpdate(BaseModel):
    show_on_website: bool


# ---------- dashboard ----------
class Dashboard(BaseModel):
    today: date
    due_today: list[JobSummary]
    overdue: list[JobSummary]
    ready_not_collected: list[JobSummary]
    in_progress_count: int
    received_count: int
    week_income: Money
    week_jobs_in: int
    month_income: Money
    recent_reviews: list[ReviewOut]
    average_rating: float | None
    review_count: int
    customer_count: int


TokenOut.model_rebuild()
