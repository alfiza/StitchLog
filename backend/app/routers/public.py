"""Customer-facing endpoints. No login: access is by the job's random token."""

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from .. import schemas
from ..db import get_db
from ..images import media_url
from ..models import Job, JobItem, Review
from ..settings_store import get_all

router = APIRouter(prefix="/api/public", tags=["public"])


def _job_by_token(db: Session, token: str) -> Job:
    if not token or len(token) < 16:
        raise HTTPException(status_code=404, detail="Not found")
    job = db.scalar(
        select(Job)
        .where(Job.public_token == token)
        .options(
            selectinload(Job.customer),
            selectinload(Job.items).selectinload(JobItem.photos),
            selectinload(Job.review),
        )
        .execution_options(populate_existing=True)
    )
    if job is None:
        raise HTTPException(status_code=404, detail="Not found")
    return job


def _public(db: Session, job: Job) -> schemas.PublicJob:
    s = get_all(db)
    return schemas.PublicJob(
        job_number=job.job_number,
        status=job.status,
        first_name=job.customer.first_name,
        due_date=job.due_date,
        created_at=job.created_at,
        ready_at=job.ready_at,
        collected_at=job.collected_at,
        total_price=job.total_price,
        balance_due=job.balance_due,
        paid=job.paid,
        items=[
            schemas.PublicItem(
                garment_type=i.garment_type,
                colour=i.colour,
                details=i.details,
                job_price=i.job_price,
                photos=[
                    schemas.PublicPhoto(
                        type=p.type, url=media_url(p.path), thumb_url=media_url(p.thumb_path), alt_text=p.alt_text
                    )
                    for p in i.photos
                ],
            )
            for i in job.items
        ],
        review=schemas.ReviewOut.model_validate(job.review) if job.review else None,
        business=schemas.PublicBusiness(
            name=s["business_name"],
            phone=s["phone"],
            whatsapp=s["whatsapp"],
            address=s["address"],
            eircode=s["eircode"],
            opening_hours=s["opening_hours"],
            google_review_url=s["google_review_url"],
        ),
    )


@router.get("/jobs/{token}", response_model=schemas.PublicJob)
def public_job(token: str, response: Response, db: Session = Depends(get_db)):
    response.headers["X-Robots-Tag"] = "noindex, nofollow"  # private pages never show in Google
    response.headers["Cache-Control"] = "no-store"
    return _public(db, _job_by_token(db, token))


@router.post("/jobs/{token}/review", response_model=schemas.PublicJob, status_code=201)
def leave_review(token: str, body: schemas.ReviewIn, response: Response, db: Session = Depends(get_db)):
    response.headers["X-Robots-Tag"] = "noindex, nofollow"
    job = _job_by_token(db, token)
    if job.review is not None:
        raise HTTPException(status_code=409, detail="You already left a review for this job. Thank you!")
    db.add(Review(job_id=job.id, rating=body.rating, comment=body.comment.strip()))
    db.commit()
    return _public(db, _job_by_token(db, token))
