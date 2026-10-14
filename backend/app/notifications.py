"""Customer messages: "we have your job" (on create) and "job ready".

Providers:
- console: only logs the message. The admin panel shows a "Send on WhatsApp" button
  (wa.me link with the text filled in) so you can send it from your own phone for free.
- twilio_sms / twilio_whatsapp: sends automatically through Twilio.
"""

import logging
from urllib.parse import quote

import httpx
from sqlalchemy.orm import Session

from .config import get_settings
from .db import SessionLocal
from .models import Job, MessageLog
from .phone import whatsapp_number
from .settings_store import get_all

log = logging.getLogger("stitchlog.notify")


class _SafeDict(dict):
    def __missing__(self, key):  # unknown {placeholders} are left as they are
        return "{" + key + "}"


def public_job_url(job: Job) -> str:
    return f"{get_settings().public_base_url.rstrip('/')}/j/{job.public_token}"


def _item_lines(job: Job) -> str:
    lines = []
    for i in job.items:
        name = f"{i.garment_type} ({i.colour})" if i.colour else i.garment_type
        what = " ".join((i.details or "").split())  # one line, even if typed on several
        line = f"- {name}"
        if what:
            line += f": {what}"
        line += f" (€{i.job_price:.2f})"
        lines.append(line)
    return "\n".join(lines)


def _due_text(job: Job) -> str:
    if not job.due_date:
        return "we'll let you know"
    d = job.due_date
    return f"{d:%a} {d.day} {d:%b}"


def _values(db: Session, job: Job) -> tuple[dict[str, str], "_SafeDict"]:
    settings = get_all(db)
    paid = job.total_price if job.paid else min(job.deposit or 0, job.total_price)
    values = _SafeDict(
        first_name=job.customer.first_name,
        last_name=job.customer.last_name,
        business_name=settings["business_name"],
        job_number=job.job_number,
        balance=f"{job.balance_due:.2f}",
        total=f"{job.total_price:.2f}",
        paid=f"{paid:.2f}",
        deposit=f"{(job.deposit or 0):.2f}",
        items=_item_lines(job),
        due_date=_due_text(job),
        job_link=public_job_url(job),
        review_link=settings.get("google_review_url", ""),
        phone=settings.get("phone", ""),
    )
    return settings, values


def ready_message(db: Session, job: Job) -> str:
    settings, values = _values(db, job)
    template = settings["ready_message"]
    if settings.get("google_review_url") and "{review_link}" not in template:
        template += " Happy with the work? A Google review means a lot: {review_link}"
    return template.format_map(values)


def received_message(db: Session, job: Job) -> str:
    """Sent when a job is created, so the customer has the details in writing."""
    settings, values = _values(db, job)
    return settings["received_message"].format_map(values)


def message_for(db: Session, job: Job, kind: str = "ready") -> str:
    return received_message(db, job) if kind == "received" else ready_message(db, job)


def whatsapp_link(db: Session, job: Job, kind: str = "ready") -> str:
    return f"https://wa.me/{whatsapp_number(job.customer.phone)}?text={quote(message_for(db, job, kind))}"


def queue_message(db: Session, job: Job, kind: str = "ready") -> MessageLog:
    s = get_settings()
    channel = {"twilio_sms": "sms", "twilio_whatsapp": "whatsapp"}.get(s.notify_provider, "console")
    msg = MessageLog(job_id=job.id, kind=kind, channel=channel, to=job.customer.phone, body=message_for(db, job, kind))
    msg.status = "queued" if channel != "console" else "logged"
    db.add(msg)
    db.commit()
    if channel == "console":
        log.info("%s message for %s to %s: %s", kind.title(), job.job_number, msg.to, msg.body)
    return msg


def queue_ready_message(db: Session, job: Job) -> MessageLog:
    return queue_message(db, job, "ready")


def deliver(message_id: int) -> None:
    """Runs in the background after the response is sent."""
    s = get_settings()
    if s.notify_provider not in ("twilio_sms", "twilio_whatsapp"):
        return
    db = SessionLocal()
    try:
        msg = db.get(MessageLog, message_id)
        if msg is None or msg.status != "queued":
            return
        to = msg.to if msg.channel == "sms" else f"whatsapp:{msg.to}"
        try:
            r = httpx.post(
                f"https://api.twilio.com/2010-04-01/Accounts/{s.twilio_account_sid}/Messages.json",
                data={"To": to, "From": s.twilio_from, "Body": msg.body},
                auth=(s.twilio_account_sid or "", s.twilio_auth_token or ""),
                timeout=20,
            )
            if r.status_code < 300:
                msg.status = "sent"
            else:
                msg.status = "failed"
                msg.error = r.text[:1000]
        except httpx.HTTPError as e:
            msg.status = "failed"
            msg.error = str(e)[:1000]
        db.commit()
    finally:
        db.close()
