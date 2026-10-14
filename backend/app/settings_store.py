"""Business settings editable from the admin panel (name, address, message text...)."""

from sqlalchemy.orm import Session

from .models import SiteSetting

DEFAULTS: dict[str, str] = {
    "business_name": "Aoife Stitch Studio",
    "phone": "",
    "whatsapp": "",
    "email": "",
    "address": "",
    "eircode": "",
    "opening_hours": "",
    "google_review_url": "",
    "instagram_url": "",
    "facebook_url": "",
    "ready_message": (
        "Hi {first_name}, your alterations at {business_name} are ready for pickup "
        "(job {job_number}). Balance due: €{balance}. Details & photos: {job_link}"
    ),
    "received_message": (
        "Hi {first_name}, thanks for choosing {business_name}! We have your job {job_number}:\n"
        "{items}\n"
        "Total: €{total}. Paid: €{paid}. Balance due: €{balance}.\n"
        "Ready by: {due_date}.\n"
        "See your job anytime: {job_link}"
    ),
    "garment_types": "Dress,Trousers,Skirt,Blouse,Shirt,Jacket,Coat,Jeans,Saree blouse,Lehenga,Wedding dress,Curtains,Other",
}

KEYS = list(DEFAULTS)


def get_all(db: Session) -> dict[str, str]:
    values = dict(DEFAULTS)
    for row in db.query(SiteSetting).all():
        if row.key in values:
            values[row.key] = row.value
    return values


def update(db: Session, data: dict[str, str]) -> dict[str, str]:
    for key, value in data.items():
        if key not in DEFAULTS or value is None:
            continue
        row = db.get(SiteSetting, key)
        if row is None:
            db.add(SiteSetting(key=key, value=value))
        else:
            row.value = value
    db.commit()
    return get_all(db)
