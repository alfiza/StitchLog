import re
from datetime import timedelta

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from .. import schemas
from ..auth import get_current_user
from ..config import get_settings
from ..db import get_db
from ..images import InvalidImage, delete_files, save_job_photo
from ..models import (
    OPEN_STATUSES,
    Customer,
    Job,
    JobItem,
    JobPhoto,
    JobStatus,
    MessageLog,
    PhotoType,
    Review,
    utcnow,
)
from ..notifications import deliver, message_for, queue_message, queue_ready_message
from ..phone import phone_search_digits
from ..serializers import job_out, job_summary, photo_out
from ..timeutil import today_local

router = APIRouter(prefix="/api", tags=["jobs"], dependencies=[Depends(get_current_user)])

JOB_LOAD = (
    selectinload(Job.customer),
    selectinload(Job.items).selectinload(JobItem.photos),
    selectinload(Job.review),
    selectinload(Job.messages),
)


def _get_job(db: Session, job_id: int) -> Job:
    job = db.get(Job, job_id, options=JOB_LOAD, populate_existing=True)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


def next_job_number(db: Session) -> str:
    prefix = get_settings().job_number_prefix
    numbers = db.scalars(select(Job.job_number).where(Job.job_number.like(f"{prefix}-%"))).all()
    highest = 0
    for n in numbers:
        m = re.fullmatch(rf"{re.escape(prefix)}-(\d+)", n)
        if m:
            highest = max(highest, int(m.group(1)))
    return f"{prefix}-{highest + 1:04d}"


def _apply_items(db: Session, job: Job, items: list[schemas.JobItemIn]) -> list[str]:
    """Replace the job's items with this list, keeping existing ones (and their photos) by id.
    Returns photo file paths to delete for removed items."""
    existing = {i.id: i for i in job.items}
    keep_ids = set()
    removed_paths: list[str] = []
    new_items: list[JobItem] = []
    for pos, data in enumerate(items):
        fields = data.model_dump(exclude={"id"})
        if data.id and data.id in existing:
            item = existing[data.id]
            for k, v in fields.items():
                setattr(item, k, v)
            item.position = pos
            keep_ids.add(item.id)
        else:
            item = JobItem(position=pos, **fields)
        new_items.append(item)
    for item_id, item in existing.items():
        if item_id not in keep_ids:
            removed_paths += [p for ph in item.photos for p in (ph.path, ph.thumb_path)]
    job.items = new_items
    return removed_paths


@router.get("/jobs")
def list_jobs(
    status: list[schemas.JobStatus] | None = Query(None),
    due: str | None = Query(None, pattern="^(today|overdue|week)$"),
    q: str = "",
    limit: int = Query(50, le=200),
    offset: int = 0,
    db: Session = Depends(get_db),
):
    stmt = select(Job).join(Customer, Job.customer_id == Customer.id)
    if status:
        stmt = stmt.where(Job.status.in_(status))
    today = today_local()
    if due == "today":
        stmt = stmt.where(Job.due_date == today)
    elif due == "overdue":
        stmt = stmt.where(Job.due_date < today, Job.status.in_(OPEN_STATUSES))
    elif due == "week":
        stmt = stmt.where(Job.due_date >= today, Job.due_date <= today + timedelta(days=7))
    text = q.strip()
    if text:
        conds = [func.lower(Job.job_number).like(f"%{text.lower()}%")]
        digits = phone_search_digits(text)
        if len(digits) >= 3:
            conds.append(Customer.phone.contains(digits))
        for word in text.split():
            w = f"%{word.lower()}%"
            conds.append(or_(func.lower(Customer.first_name).like(w), func.lower(Customer.last_name).like(w)))
        stmt = stmt.where(or_(*conds))
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    if due in ("today", "overdue", "week"):
        order = (Job.urgent.desc(), Job.due_date.asc(), Job.id.asc())
    else:
        order = (Job.created_at.desc(), Job.id.desc())
    jobs = db.scalars(
        stmt.options(selectinload(Job.customer), selectinload(Job.items)).order_by(*order).limit(limit).offset(offset)
    ).all()
    return {"items": [job_summary(j) for j in jobs], "total": total}


@router.post("/jobs", response_model=schemas.JobOut, status_code=201)
def create_job(body: schemas.JobCreate, background: BackgroundTasks, db: Session = Depends(get_db)):
    if db.get(Customer, body.customer_id) is None:
        raise HTTPException(status_code=404, detail="Customer not found")
    for attempt in range(3):
        job = Job(
            customer_id=body.customer_id,
            job_number=next_job_number(db),
            **body.model_dump(exclude={"customer_id", "items", "notify"}),
        )
        _apply_items(db, job, body.items)
        db.add(job)
        try:
            db.commit()
            break
        except IntegrityError:  # two jobs created at the same moment got the same number
            db.rollback()
            if attempt == 2:
                raise
    if body.notify:  # send the customer the job details
        msg = queue_message(db, _get_job(db, job.id), "received")
        background.add_task(deliver, msg.id)
    return job_out(db, _get_job(db, job.id))


@router.get("/jobs/by-number/{job_number}", response_model=schemas.JobOut)
def get_job_by_number(job_number: str, db: Session = Depends(get_db)):
    job_id = db.scalar(select(Job.id).where(func.upper(Job.job_number) == job_number.strip().upper()))
    if job_id is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return job_out(db, _get_job(db, job_id))


@router.get("/jobs/{job_id}", response_model=schemas.JobOut)
def get_job(job_id: int, db: Session = Depends(get_db)):
    return job_out(db, _get_job(db, job_id))


@router.patch("/jobs/{job_id}", response_model=schemas.JobOut)
def update_job(job_id: int, body: schemas.JobUpdate, db: Session = Depends(get_db)):
    job = _get_job(db, job_id)
    data = body.model_dump(exclude_unset=True, exclude={"items"})
    for k, v in data.items():
        setattr(job, k, v)
    removed: list[str] = []
    if body.items is not None:
        if not body.items:
            raise HTTPException(status_code=422, detail="A job needs at least one item")
        removed = _apply_items(db, job, body.items)
    db.commit()
    delete_files(*removed)
    return job_out(db, _get_job(db, job.id))


@router.post("/jobs/{job_id}/status", response_model=schemas.JobOut)
def change_status(
    job_id: int, body: schemas.StatusChange, background: BackgroundTasks, db: Session = Depends(get_db)
):
    job = _get_job(db, job_id)
    old = job.status
    new = body.status
    now = utcnow()
    job.status = new
    if new in (JobStatus.ready, JobStatus.collected) and job.ready_at is None:
        job.ready_at = now
    if new == JobStatus.collected and job.collected_at is None:
        job.collected_at = now
    if new in OPEN_STATUSES:  # moved back: clear later timestamps
        job.ready_at = None
        job.collected_at = None
    if new == JobStatus.ready:
        job.collected_at = None
    db.commit()
    if new == JobStatus.ready and old != JobStatus.ready and body.notify:
        msg = queue_ready_message(db, _get_job(db, job.id))
        background.add_task(deliver, msg.id)
    return job_out(db, _get_job(db, job.id))


@router.post("/jobs/{job_id}/notify", response_model=schemas.JobOut)
def resend_ready_message(job_id: int, background: BackgroundTasks, db: Session = Depends(get_db)):
    job = _get_job(db, job_id)
    msg = queue_ready_message(db, job)
    background.add_task(deliver, msg.id)
    return job_out(db, _get_job(db, job.id))


@router.post("/jobs/{job_id}/whatsapp-sent", response_model=schemas.JobOut)
def log_whatsapp_sent(
    job_id: int, kind: str = Query("ready", pattern="^(ready|received)$"), db: Session = Depends(get_db)
):
    """Record that a message (job details or ready) was sent by hand through the WhatsApp button."""
    job = _get_job(db, job_id)
    db.add(
        MessageLog(
            job_id=job.id,
            kind=kind,
            channel="whatsapp_link",
            to=job.customer.phone,
            body=message_for(db, job, kind),
            status="sent",
        )
    )
    db.commit()
    return job_out(db, _get_job(db, job.id))


@router.delete("/jobs/{job_id}", status_code=204)
def delete_job(job_id: int, db: Session = Depends(get_db)):
    job = _get_job(db, job_id)
    paths = [p for i in job.items for ph in i.photos for p in (ph.path, ph.thumb_path)]
    db.delete(job)
    db.commit()
    delete_files(*paths)


# ---------- photos ----------
@router.post("/job-items/{item_id}/photos", response_model=list[schemas.PhotoOut], status_code=201)
async def upload_photos(
    item_id: int,
    type: PhotoType = Form(...),
    files: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
):
    item = db.get(JobItem, item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Item not found")
    created: list[JobPhoto] = []
    for f in files:
        data = await f.read()
        try:
            info = save_job_photo(data, item.job_id)
        except InvalidImage as e:
            raise HTTPException(status_code=422, detail=f"{f.filename}: {e}") from e
        alt = f"{item.colour} {item.garment_type} {type.value} alteration".strip()
        photo = JobPhoto(job_item_id=item.id, type=type, alt_text=alt, **info)
        db.add(photo)
        created.append(photo)
    db.commit()
    return [photo_out(p) for p in created]


@router.delete("/photos/{photo_id}", status_code=204)
def delete_photo(photo_id: int, db: Session = Depends(get_db)):
    photo = db.get(JobPhoto, photo_id)
    if photo is None:
        raise HTTPException(status_code=404, detail="Photo not found")
    paths = (photo.path, photo.thumb_path)
    db.delete(photo)
    db.commit()
    delete_files(*paths)


# ---------- reviews ----------
@router.get("/reviews", response_model=list[schemas.ReviewOut])
def list_reviews(db: Session = Depends(get_db)):
    return db.scalars(select(Review).order_by(Review.created_at.desc())).all()


@router.patch("/reviews/{review_id}", response_model=schemas.ReviewOut)
def update_review(review_id: int, body: schemas.ReviewUpdate, db: Session = Depends(get_db)):
    review = db.get(Review, review_id)
    if review is None:
        raise HTTPException(status_code=404, detail="Review not found")
    review.show_on_website = body.show_on_website
    db.commit()
    return review

