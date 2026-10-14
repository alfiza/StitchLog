import enum
import secrets
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def new_public_token() -> str:
    return secrets.token_urlsafe(24)  # 32 chars, not guessable


Money = Numeric(10, 2)


class JobStatus(str, enum.Enum):
    received = "received"
    in_progress = "in_progress"
    ready = "ready"
    collected = "collected"
    cancelled = "cancelled"


OPEN_STATUSES = (JobStatus.received, JobStatus.in_progress)


class PhotoType(str, enum.Enum):
    before = "before"
    after = "after"


class PaymentMethod(str, enum.Enum):
    cash = "cash"
    card = "card"
    revolut = "revolut"
    other = "other"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True)
    name: Mapped[str] = mapped_column(String(100), default="")
    password_hash: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Customer(Base):
    __tablename__ = "customers"

    id: Mapped[int] = mapped_column(primary_key=True)
    first_name: Mapped[str] = mapped_column(String(100))
    last_name: Mapped[str] = mapped_column(String(100), default="")
    phone: Mapped[str] = mapped_column(String(20), unique=True, index=True)  # E.164
    email: Mapped[str | None] = mapped_column(String(255))
    notes: Mapped[str] = mapped_column(Text, default="")
    tags: Mapped[str] = mapped_column(String(255), default="")  # comma separated: VIP, regular, wedding party
    sms_consent: Mapped[bool] = mapped_column(Boolean, default=False)
    photo_consent: Mapped[bool] = mapped_column(Boolean, default=False)
    source: Mapped[str] = mapped_column(String(50), default="")  # e.g. "diary-2026", "fresha-2024"
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    jobs: Mapped[list["Job"]] = relationship(
        back_populates="customer", cascade="all, delete-orphan", passive_deletes=True
    )
    measurements: Mapped[list["Measurement"]] = relationship(
        back_populates="customer",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="Measurement.label",
    )


class Measurement(Base):
    __tablename__ = "measurements"
    __table_args__ = (UniqueConstraint("customer_id", "label"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id", ondelete="CASCADE"), index=True)
    label: Mapped[str] = mapped_column(String(50))
    value: Mapped[Decimal] = mapped_column(Numeric(6, 1))
    unit: Mapped[str] = mapped_column(String(10), default="cm")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    customer: Mapped[Customer] = relationship(back_populates="measurements")


class Job(Base):
    __tablename__ = "jobs"

    id: Mapped[int] = mapped_column(primary_key=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id", ondelete="CASCADE"), index=True)
    job_number: Mapped[str] = mapped_column(String(20), unique=True)
    status: Mapped[JobStatus] = mapped_column(
        Enum(JobStatus, native_enum=False, length=20), default=JobStatus.received, index=True
    )
    due_date: Mapped[date | None] = mapped_column(Date, index=True)
    urgent: Mapped[bool] = mapped_column(Boolean, default=False)
    deposit: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"))
    paid: Mapped[bool] = mapped_column(Boolean, default=False)
    payment_method: Mapped[PaymentMethod | None] = mapped_column(
        Enum(PaymentMethod, native_enum=False, length=20)
    )
    public_token: Mapped[str] = mapped_column(String(64), unique=True, default=new_public_token)
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    ready_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    collected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    customer: Mapped[Customer] = relationship(back_populates="jobs")
    items: Mapped[list["JobItem"]] = relationship(
        back_populates="job", cascade="all, delete-orphan", passive_deletes=True, order_by="JobItem.position"
    )
    review: Mapped["Review | None"] = relationship(
        back_populates="job", cascade="all, delete-orphan", passive_deletes=True
    )
    messages: Mapped[list["MessageLog"]] = relationship(
        back_populates="job", cascade="all, delete-orphan", passive_deletes=True, order_by="MessageLog.sent_at"
    )

    @property
    def total_price(self) -> Decimal:
        return sum((i.job_price or Decimal("0") for i in self.items), Decimal("0"))

    @property
    def balance_due(self) -> Decimal:
        if self.paid:
            return Decimal("0")
        return max(self.total_price - (self.deposit or Decimal("0")), Decimal("0"))


class JobItem(Base):
    __tablename__ = "job_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("jobs.id", ondelete="CASCADE"), index=True)
    position: Mapped[int] = mapped_column(Integer, default=0)
    garment_type: Mapped[str] = mapped_column(String(50), default="dress")
    colour: Mapped[str] = mapped_column(String(50), default="")
    details: Mapped[str] = mapped_column(Text, default="")
    original_price: Mapped[Decimal | None] = mapped_column(Money)
    job_price: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"))

    job: Mapped[Job] = relationship(back_populates="items")
    photos: Mapped[list["JobPhoto"]] = relationship(
        back_populates="item", cascade="all, delete-orphan", passive_deletes=True, order_by="JobPhoto.created_at"
    )


class JobPhoto(Base):
    __tablename__ = "job_photos"

    id: Mapped[int] = mapped_column(primary_key=True)
    job_item_id: Mapped[int] = mapped_column(ForeignKey("job_items.id", ondelete="CASCADE"), index=True)
    type: Mapped[PhotoType] = mapped_column(Enum(PhotoType, native_enum=False, length=10))
    path: Mapped[str] = mapped_column(String(255))  # relative to media_dir
    thumb_path: Mapped[str] = mapped_column(String(255))
    width: Mapped[int] = mapped_column(Integer, default=0)
    height: Mapped[int] = mapped_column(Integer, default=0)
    alt_text: Mapped[str] = mapped_column(String(255), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    item: Mapped[JobItem] = relationship(back_populates="photos")


class Review(Base):
    __tablename__ = "reviews"

    id: Mapped[int] = mapped_column(primary_key=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("jobs.id", ondelete="CASCADE"), unique=True)
    rating: Mapped[int] = mapped_column(Integer)
    comment: Mapped[str] = mapped_column(Text, default="")
    show_on_website: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    job: Mapped[Job] = relationship(back_populates="review")


class MessageLog(Base):
    __tablename__ = "messages_log"

    id: Mapped[int] = mapped_column(primary_key=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("jobs.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(20), default="ready", server_default="ready")  # received / ready
    channel: Mapped[str] = mapped_column(String(20))  # console / sms / whatsapp / whatsapp_link
    to: Mapped[str] = mapped_column(String(30))
    body: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="queued")  # queued / sent / failed / logged
    error: Mapped[str] = mapped_column(Text, default="")
    sent_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    job: Mapped[Job] = relationship(back_populates="messages")


class Service(Base):
    """Price list. Used to fill job items quickly; later shown on the website."""

    __tablename__ = "services"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    garment_type: Mapped[str] = mapped_column(String(50), default="")
    price_from: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"))
    description: Mapped[str] = mapped_column(Text, default="")
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    # website / SEO fields (used in the website phase)
    slug: Mapped[str | None] = mapped_column(String(120), unique=True)
    seo_title: Mapped[str] = mapped_column(String(70), default="")
    seo_description: Mapped[str] = mapped_column(String(170), default="")


class SiteSetting(Base):
    """Simple key/value store for business details and message templates."""

    __tablename__ = "site_settings"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[str] = mapped_column(Text, default="")



class InventoryItem(Base):
    """Stock bought for the business (thread, zips, fabric, tools...). The purchase cost counts as an expense."""

    __tablename__ = "inventory_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    # "shop" = alterations stock (counts as expenses in Reports); "beauty" = nails & brows stock, kept separate
    section: Mapped[str] = mapped_column(String(20), default="shop", server_default="shop", index=True)
    name: Mapped[str] = mapped_column(String(150))
    category: Mapped[str] = mapped_column(String(50), default="Other", index=True)
    supplier: Mapped[str] = mapped_column(String(120), default="")
    bought_on: Mapped[date] = mapped_column(Date, index=True)
    quantity: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("1"))  # how many were bought
    quantity_left: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("1"))  # still in stock
    unit: Mapped[str] = mapped_column(String(20), default="pcs")
    unit_price: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"))
    low_stock_at: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))  # warn when quantity_left <= this
    buy_url: Mapped[str] = mapped_column(String(500), default="", server_default="")  # where to buy it again
    image_url: Mapped[str] = mapped_column(String(500), default="", server_default="")  # product photo from the shop
    payment_method: Mapped[PaymentMethod | None] = mapped_column(Enum(PaymentMethod, native_enum=False, length=20))
    notes: Mapped[str] = mapped_column(Text, default="")
    receipt_path: Mapped[str] = mapped_column(String(255), default="")  # relative to media_dir
    receipt_thumb_path: Mapped[str] = mapped_column(String(255), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    @property
    def total_cost(self) -> Decimal:
        return ((self.quantity or Decimal("0")) * (self.unit_price or Decimal("0"))).quantize(Decimal("0.01"))

    @property
    def stock_value(self) -> Decimal:
        return ((self.quantity_left or Decimal("0")) * (self.unit_price or Decimal("0"))).quantize(Decimal("0.01"))

    @property
    def stock_status(self) -> str:
        left = self.quantity_left or Decimal("0")
        if left <= 0:
            return "out"
        if self.low_stock_at is not None and left <= self.low_stock_at:
            return "low"
        return "ok"
