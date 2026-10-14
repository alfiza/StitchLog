"""Add test customers and jobs to try the app with.

    python -m scripts.seed_test_data             # testuser1..testuser5, one job each
    python -m scripts.seed_test_data --jobs 3    # three jobs each
    python -m scripts.seed_test_data --remove    # delete all test customers and their jobs

Test customers have source "test" and phone numbers 089 000 0001 to 089 000 0005.
Don't press "Send on WhatsApp" for them: those numbers are made up.
"""

import argparse
from datetime import timedelta
from decimal import Decimal

from app.db import SessionLocal
from app.images import delete_files
from app.models import Customer, Job, JobItem, JobStatus, utcnow
from app.routers.jobs import next_job_number
from app.timeutil import today_local

# (garment, colour, what needs doing, price)
WORK = [
    ("Dress", "Red", "Take in waist 2cm, shorten hem to knee", 30),
    ("Trousers", "Black", "Hem 3cm, keep original hem", 15),
    ("Wedding dress", "Ivory", "Bustle and hem, fitting on Friday", 140),
    ("Saree blouse", "Maroon", "Stitch blouse from customer's fabric", 35),
    ("Jacket", "Navy", "Shorten sleeves 2cm", 25),
    ("Lehenga", "Pink", "Take in waist, adjust length", 40),
    ("Curtains", "Grey", "Hem 2 panels", 40),
]

# (status, due in days from today, deposit, paid)
STAGES = [
    (JobStatus.received, 5, 10, False),
    (JobStatus.in_progress, 2, 0, False),
    (JobStatus.in_progress, -2, 10, False),  # overdue
    (JobStatus.ready, 0, 10, False),
    (JobStatus.collected, -5, 0, True),
]


def add(customers: int, jobs_each: int) -> None:
    db = SessionLocal()
    today = today_local()
    made_c = made_j = 0
    for n in range(1, customers + 1):
        phone = f"+35389000{n:04d}"  # 089 000 0001, 089 000 0002, ...
        c = db.query(Customer).filter(Customer.phone == phone).first()
        if c is None:
            c = Customer(
                first_name=f"testuser{n}",
                last_name="",
                phone=phone,
                notes="Test customer, safe to delete",
                tags="test",
                source="test",
            )
            db.add(c)
            db.flush()
            made_c += 1
        for k in range(jobs_each):
            status, due_in, deposit, paid = STAGES[(n - 1 + k) % len(STAGES)]
            items = [WORK[(n + k) % len(WORK)]]
            if (n + k) % 2 == 0:  # every other job has two items
                items.append(WORK[(n + k + 3) % len(WORK)])
            job = Job(
                customer_id=c.id,
                job_number=next_job_number(db),
                status=status,
                due_date=today + timedelta(days=due_in),
                deposit=Decimal(deposit),
                paid=paid,
                payment_method="cash" if paid else None,
                urgent=(status == JobStatus.in_progress and due_in < 0),
                notes="Test job",
            )
            job.items = [
                JobItem(position=i, garment_type=g, colour=col, details=d, job_price=Decimal(p))
                for i, (g, col, d, p) in enumerate(items)
            ]
            now = utcnow()
            if status in (JobStatus.ready, JobStatus.collected):
                job.ready_at = now - timedelta(days=1)
            if status == JobStatus.collected:
                job.collected_at = now
            db.add(job)
            db.flush()
            made_j += 1
    db.commit()
    db.close()
    print(f"Added {made_c} test customers and {made_j} jobs.")


def remove() -> None:
    db = SessionLocal()
    customers = db.query(Customer).filter(Customer.source == "test").all()
    paths = [
        p
        for c in customers
        for j in c.jobs
        for i in j.items
        for ph in i.photos
        for p in (ph.path, ph.thumb_path)
    ]
    jobs = sum(len(c.jobs) for c in customers)
    for c in customers:
        db.delete(c)
    db.commit()
    db.close()
    delete_files(*paths)
    print(f"Removed {len(customers)} test customers and {jobs} jobs.")


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--customers", type=int, default=5)
    p.add_argument("--jobs", type=int, default=1, help="jobs per customer")
    p.add_argument("--remove", action="store_true", help="delete all test customers and their jobs")
    a = p.parse_args()
    if a.remove:
        remove()
    else:
        add(a.customers, a.jobs)


if __name__ == "__main__":
    main()
