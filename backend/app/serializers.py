"""Turn ORM objects into API responses (adds display phone, photo URLs, links)."""

from sqlalchemy.orm import Session

from . import schemas
from .images import media_url
from .models import Customer, Job, JobPhoto
from .notifications import public_job_url, whatsapp_link
from .phone import display_phone


def photo_out(p: JobPhoto) -> schemas.PhotoOut:
    return schemas.PhotoOut(
        id=p.id,
        type=p.type,
        url=media_url(p.path),
        thumb_url=media_url(p.thumb_path),
        width=p.width,
        height=p.height,
        alt_text=p.alt_text,
    )


def customer_mini(c: Customer) -> schemas.CustomerMini:
    return schemas.CustomerMini(
        id=c.id, first_name=c.first_name, last_name=c.last_name, phone=c.phone, phone_display=display_phone(c.phone)
    )


def items_label(job: Job) -> str:
    names = [i.garment_type or "Item" for i in job.items]
    if not names:
        return ""
    counts: dict[str, int] = {}
    for n in names:
        counts[n] = counts.get(n, 0) + 1
    return ", ".join(f"{k} x{v}" if v > 1 else k for k, v in counts.items())


def job_summary(job: Job, with_customer: bool = True) -> schemas.JobSummary:
    return schemas.JobSummary(
        id=job.id,
        job_number=job.job_number,
        status=job.status,
        due_date=job.due_date,
        urgent=job.urgent,
        paid=job.paid,
        deposit=job.deposit,
        total_price=job.total_price,
        balance_due=job.balance_due,
        created_at=job.created_at,
        ready_at=job.ready_at,
        collected_at=job.collected_at,
        item_count=len(job.items),
        items_label=items_label(job),
        customer=customer_mini(job.customer) if with_customer else None,
    )


def job_out(db: Session, job: Job) -> schemas.JobOut:
    base = job_summary(job).model_dump()
    items = [
        schemas.JobItemOut(
            id=i.id,
            position=i.position,
            garment_type=i.garment_type,
            colour=i.colour,
            details=i.details,
            original_price=i.original_price,
            job_price=i.job_price,
            photos=[photo_out(p) for p in i.photos],
        )
        for i in job.items
    ]
    return schemas.JobOut(
        **base,
        payment_method=job.payment_method,
        notes=job.notes,
        public_token=job.public_token,
        public_url=public_job_url(job),
        whatsapp_url=whatsapp_link(db, job),
        whatsapp_received_url=whatsapp_link(db, job, "received"),
        items=items,
        review=schemas.ReviewOut.model_validate(job.review) if job.review else None,
        messages=[schemas.MessageOut.model_validate(m) for m in job.messages],
    )


def customer_out(c: Customer) -> dict:
    data = schemas.CustomerOut.model_validate(c).model_dump()
    data["phone_display"] = display_phone(c.phone)
    return data


def customer_detail(c: Customer) -> schemas.CustomerDetail:
    jobs = sorted(c.jobs, key=lambda j: j.created_at, reverse=True)
    return schemas.CustomerDetail(
        **customer_out(c),
        measurements=[schemas.MeasurementOut.model_validate(m) for m in c.measurements],
        jobs=[job_summary(j, with_customer=False) for j in jobs],
    )
