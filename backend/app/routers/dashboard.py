from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from .. import schemas
from ..auth import get_current_user
from ..db import get_db
from ..models import OPEN_STATUSES, Customer, Job, JobItem, JobStatus, Review
from ..serializers import job_summary
from ..timeutil import local_day_start_utc, today_local, week_start

router = APIRouter(prefix="/api", tags=["dashboard"], dependencies=[Depends(get_current_user)])


def _collected_income(db: Session, since) -> float:
    """Value of jobs collected since a time (sum of item prices)."""
    total = db.scalar(
        select(func.coalesce(func.sum(JobItem.job_price), 0))
        .join(Job, JobItem.job_id == Job.id)
        .where(Job.status == JobStatus.collected, Job.collected_at >= since)
    )
    return total or 0


@router.get("/dashboard", response_model=schemas.Dashboard)
def dashboard(db: Session = Depends(get_db)):
    today = today_local()
    load = (selectinload(Job.customer), selectinload(Job.items))

    def jobs(*where, order=(Job.urgent.desc(), Job.due_date.asc(), Job.id.asc())):
        return [job_summary(j) for j in db.scalars(select(Job).where(*where).options(*load).order_by(*order)).all()]

    week_from = local_day_start_utc(week_start(today))
    month_from = local_day_start_utc(today.replace(day=1))
    counts = dict(db.execute(select(Job.status, func.count()).group_by(Job.status)).all())
    avg, review_count = db.execute(select(func.avg(Review.rating), func.count(Review.id))).one()

    return schemas.Dashboard(
        today=today,
        due_today=jobs(Job.due_date == today, Job.status.in_(OPEN_STATUSES)),
        overdue=jobs(Job.due_date < today, Job.status.in_(OPEN_STATUSES)),
        ready_not_collected=jobs(Job.status == JobStatus.ready, order=(Job.ready_at.asc(),)),
        in_progress_count=counts.get(JobStatus.in_progress, 0),
        received_count=counts.get(JobStatus.received, 0),
        week_income=_collected_income(db, week_from),
        week_jobs_in=db.scalar(select(func.count(Job.id)).where(Job.created_at >= week_from)) or 0,
        month_income=_collected_income(db, month_from),
        recent_reviews=[
            schemas.ReviewOut.model_validate(r)
            for r in db.scalars(select(Review).order_by(Review.created_at.desc()).limit(5)).all()
        ],
        average_rating=round(float(avg), 1) if avg is not None else None,
        review_count=review_count or 0,
        customer_count=db.scalar(select(func.count(Customer.id))) or 0,
    )


