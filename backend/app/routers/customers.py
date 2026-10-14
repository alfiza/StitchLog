from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, func, or_, select, true
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from .. import schemas
from ..auth import get_current_user
from ..db import get_db
from ..images import delete_files
from ..models import OPEN_STATUSES, Customer, Job, JobItem, JobPhoto, JobStatus, Measurement
from ..phone import InvalidPhone, display_phone, normalise_phone, phone_search_digits
from ..serializers import customer_detail, customer_out

router = APIRouter(prefix="/api/customers", tags=["customers"], dependencies=[Depends(get_current_user)])


def _get(db: Session, customer_id: int) -> Customer:
    c = db.get(
        Customer,
        customer_id,
        options=[
            selectinload(Customer.measurements),
            selectinload(Customer.jobs).selectinload(Job.items),
        ],
    )
    if c is None:
        raise HTTPException(status_code=404, detail="Customer not found")
    return c


def _phone_taken(db: Session, phone: str, exclude_id: int | None = None) -> Customer | None:
    q = db.query(Customer).filter(Customer.phone == phone)
    if exclude_id:
        q = q.filter(Customer.id != exclude_id)
    return q.first()


@router.get("")
def list_customers(
    q: str = "",
    limit: int = Query(50, le=200),
    offset: int = 0,
    db: Session = Depends(get_db),
):
    """Search by name or phone (any format, partial OK). Newest activity first."""
    stats = (
        select(
            Job.customer_id.label("cid"),
            func.count(Job.id).label("job_count"),
            func.max(Job.created_at).label("last_visit"),
        )
        .group_by(Job.customer_id)
        .subquery()
    )
    open_jobs = (
        select(Job.customer_id.label("cid"), func.count(Job.id).label("open_jobs"))
        .where(Job.status.in_([*OPEN_STATUSES, JobStatus.ready]))
        .group_by(Job.customer_id)
        .subquery()
    )
    stmt = (
        select(Customer, stats.c.job_count, stats.c.last_visit, open_jobs.c.open_jobs)
        .outerjoin(stats, stats.c.cid == Customer.id)
        .outerjoin(open_jobs, open_jobs.c.cid == Customer.id)
    )
    text = q.strip()
    if text:
        # Phone: digits anywhere in the query. Name: every word must match first or last name.
        digits = phone_search_digits(text)
        words = [w.lower() for w in text.split() if not any(ch.isdigit() for ch in w)]
        name_match = and_(
            true(),
            *[
                or_(func.lower(Customer.first_name).like(f"%{w}%"), func.lower(Customer.last_name).like(f"%{w}%"))
                for w in words
            ],
        )
        if len(digits) >= 3 and words:
            stmt = stmt.where(or_(Customer.phone.contains(digits), name_match))
        elif len(digits) >= 3:
            stmt = stmt.where(Customer.phone.contains(digits))
        elif words:
            stmt = stmt.where(name_match)

    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = db.execute(
        stmt.order_by(func.coalesce(stats.c.last_visit, Customer.created_at).desc(), Customer.id.desc())
        .limit(limit)
        .offset(offset)
    ).all()
    items = []
    for c, job_count, last_visit, open_count in rows:
        d = customer_out(c)
        d.update(job_count=job_count or 0, last_visit=last_visit, open_jobs=open_count or 0)
        items.append(schemas.CustomerListItem(**d))
    return {"items": items, "total": total}


@router.get("/lookup", response_model=schemas.CustomerDetail)
def lookup_by_phone(phone: str, db: Session = Depends(get_db)):
    """Exact lookup by phone number for returning customers."""
    try:
        norm = normalise_phone(phone)
    except InvalidPhone as e:
        raise HTTPException(status_code=422, detail=str(e)) from e
    c = db.query(Customer).filter(Customer.phone == norm).first()
    if c is None:
        raise HTTPException(status_code=404, detail="No customer with that phone number")
    return customer_detail(_get(db, c.id))


@router.post("", response_model=schemas.CustomerDetail, status_code=201)
def create_customer(body: schemas.CustomerCreate, db: Session = Depends(get_db)):
    existing = _phone_taken(db, body.phone)
    if existing:
        raise HTTPException(
            status_code=409,
            detail={
                "message": f"{display_phone(body.phone)} already belongs to {existing.first_name} {existing.last_name}".strip(),
                "customer_id": existing.id,
            },
        )
    c = Customer(**body.model_dump())
    db.add(c)
    db.commit()
    return customer_detail(_get(db, c.id))


@router.get("/{customer_id}", response_model=schemas.CustomerDetail)
def get_customer(customer_id: int, db: Session = Depends(get_db)):
    return customer_detail(_get(db, customer_id))


@router.patch("/{customer_id}", response_model=schemas.CustomerDetail)
def update_customer(customer_id: int, body: schemas.CustomerUpdate, db: Session = Depends(get_db)):
    c = _get(db, customer_id)
    data = body.model_dump(exclude_unset=True)
    if "phone" in data and data["phone"] and _phone_taken(db, data["phone"], exclude_id=c.id):
        raise HTTPException(status_code=409, detail="Another customer already has that phone number")
    for k, v in data.items():
        if v is None and k in ("first_name", "phone"):
            continue
        if k in ("first_name", "last_name") and isinstance(v, str):
            v = v.strip()
        setattr(c, k, v)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Another customer already has that phone number") from None
    return customer_detail(_get(db, c.id))


@router.delete("/{customer_id}", status_code=204)
def delete_customer(customer_id: int, db: Session = Depends(get_db)):
    """GDPR erase: removes the customer, all their jobs, reviews, messages and photo files."""
    c = _get(db, customer_id)
    photos = (
        db.query(JobPhoto)
        .join(JobItem, JobPhoto.job_item_id == JobItem.id)
        .join(Job, JobItem.job_id == Job.id)
        .filter(Job.customer_id == c.id)
        .all()
    )
    paths = [p for ph in photos for p in (ph.path, ph.thumb_path)]
    db.delete(c)
    db.commit()
    delete_files(*paths)


@router.put("/{customer_id}/measurements", response_model=list[schemas.MeasurementOut])
def set_measurements(customer_id: int, body: list[schemas.MeasurementIn], db: Session = Depends(get_db)):
    """Replace the customer's measurements with this list."""
    c = _get(db, customer_id)
    wanted = {m.label.strip().lower(): m for m in body}
    for existing in list(c.measurements):
        key = existing.label.lower()
        if key in wanted:
            m = wanted.pop(key)
            if existing.value != m.value or existing.unit != m.unit or existing.label != m.label.strip():
                existing.value, existing.unit, existing.label = m.value, m.unit, m.label.strip()
        else:
            c.measurements.remove(existing)
    for m in wanted.values():
        c.measurements.append(Measurement(label=m.label.strip(), value=m.value, unit=m.unit))
    db.commit()
    db.refresh(c)
    return [schemas.MeasurementOut.model_validate(m) for m in sorted(c.measurements, key=lambda m: m.label)]
