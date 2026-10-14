"""Import existing customers into StitchLog.

    python -m scripts.import_customers diary  path/to/Customer_Contacts.xlsx
    python -m scripts.import_customers fresha path/to/customers_all_2024-10-31.csv
    (add --dry-run to see what would happen without saving)

- Phone numbers are normalised (087..., 353 87..., +353...) and used to de-duplicate,
  so running the import twice, or importing both files, never creates duplicates.
- Existing customers are left as they are; only empty fields (email) are filled in.
- Rows without a usable phone number are skipped and listed at the end.
"""

import argparse
import csv
import re
import sys
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from pathlib import Path

from app.db import SessionLocal
from app.models import Customer
from app.phone import InvalidPhone, normalise_phone


@dataclass
class Row:
    first_name: str
    last_name: str
    phone_raw: str
    email: str | None = None
    notes: list[str] = field(default_factory=list)
    sms_consent: bool = False
    created: date | None = None
    tags: list[str] = field(default_factory=list)
    mark_existing: list[str] = field(default_factory=list)  # notes added to customers already in the app


NAIL_NOTE = "Nail customer"


def looks_like_phone(text: str) -> bool:
    digits = re.sub(r"\D", "", text)
    return 9 <= len(digits) <= 15 and len(digits) >= len(text.replace(" ", "")) * 0.7


def tidy_case(s: str) -> str:
    s = (s or "").strip()
    return s[:1].upper() + s[1:] if s.islower() else s


def split_name(raw: str) -> tuple[str, str, list[str]]:
    """'Evelina (Polish pharmacy)' -> ('Evelina', '', ['Polish pharmacy'])."""
    raw = (raw or "").strip()
    extra = [m.strip() for m in re.findall(r"\(([^)]*)\)", raw) if m.strip()]
    name = re.sub(r"\([^)]*\)", "", raw).strip()
    if not name:
        return "", "", extra
    if "/" in name:
        return name, "", extra
    parts = name.split(None, 1)
    return tidy_case(parts[0]), tidy_case(parts[1]) if len(parts) > 1 else "", extra


def as_date(v) -> date | None:
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    if isinstance(v, str) and v.strip():
        try:
            return date.fromisoformat(v.strip()[:10])
        except ValueError:
            return None
    return None


def read_diary(path: Path) -> list[Row]:
    import openpyxl

    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    rows: list[Row] = []
    for ws in wb.worksheets:
        it = ws.iter_rows(values_only=True)
        header = [str(h or "").strip().lower() for h in next(it, [])]

        def col(r, *names):
            for n in names:
                for i, h in enumerate(header):
                    if h.startswith(n) and i < len(r):
                        return r[i]
            return None

        for r in it:
            phone = col(r, "phone")
            if phone in (None, ""):
                continue
            first, last, extra = split_name(str(col(r, "name") or ""))
            notes = list(extra)
            if not first:
                first = "Unknown"
                notes.append("Name missing in diary (Georgian script or unreadable), please update")
            visits, first_v, last_v = col(r, "visits"), as_date(col(r, "first visit")), as_date(col(r, "last visit"))
            if visits:
                summary = f"Diary 2026: {visits} visit{'s' if visits != 1 else ''}"
                if last_v:
                    summary += f", last {last_v:%d %b %Y}"
                notes.append(summary)
            for extra_col in ("notes", "key"):
                v = col(r, extra_col)
                if v and str(v).strip():
                    notes.append(str(v).strip())
            rows.append(
                Row(first, last, str(phone), notes=notes, created=first_v, tags=["regular"] if (visits or 0) >= 3 else [])
            )
    return rows


def read_fresha(path: Path) -> list[Row]:
    rows: list[Row] = []
    with open(path, encoding="utf-8-sig", newline="") as f:
        for r in csv.DictReader(f):
            first_raw = (r.get("First Name") or "").strip()
            last_raw = (r.get("Last Name") or "").strip()
            phone = (r.get("Mobile Number") or r.get("Telephone") or "").strip()
            note = (r.get("Note") or "").strip()
            if not (first_raw or last_raw or phone or note):
                continue  # empty line
            if not phone and looks_like_phone(note):
                phone, note = note, ""  # number was typed in the note field
            notes = [NAIL_NOTE]
            if note:
                notes.append(note)
            if r.get("Blocked") == "Yes":
                notes.append(f"Blocked in Fresha: {(r.get('Block Reason') or '').strip() or 'no reason given'}")
            rows.append(
                Row(
                    first_name=tidy_case(first_raw) or "Unknown",
                    last_name=tidy_case(last_raw),
                    phone_raw=phone,
                    email=(r.get("Email") or "").strip() or None,
                    notes=notes,
                    sms_consent=r.get("Accepts SMS Marketing") == "Yes",
                    created=as_date(r.get("Added")),
                    tags=["nail"] + (["blocked"] if r.get("Blocked") == "Yes" else []),
                    mark_existing=[NAIL_NOTE],
                )
            )
    return rows


def run(kind: str, path: Path, dry_run: bool) -> None:
    rows = read_diary(path) if kind == "diary" else read_fresha(path)
    source = "diary-2026" if kind == "diary" else "fresha-2024"
    db = SessionLocal()
    existing = {c.phone: c for c in db.query(Customer).all()}
    created = updated = dupes = 0
    skipped: list[str] = []
    for row in rows:
        try:
            phone = normalise_phone(row.phone_raw)
        except InvalidPhone:
            skipped.append(f"{row.first_name} {row.last_name} ({row.phone_raw or 'no phone'})".strip())
            continue
        c = existing.get(phone)
        if c is not None:
            if c.source == source:
                dupes += 1  # same number twice in this file, or a re-run
            changed = False
            if row.email and not c.email:
                c.email = row.email
                changed = True
            if c.first_name == "Unknown" and row.first_name != "Unknown":
                # a name was filled in later (e.g. on the "Georgian names" sheet)
                c.first_name, c.last_name = row.first_name[:100], row.last_name[:100]
                c.notes = "\n".join(n for n in c.notes.split("\n") if not n.startswith("Name missing in diary"))
                changed = True
            for line in row.mark_existing:  # e.g. a diary customer who also comes for nails
                if line not in c.notes.split("\n"):
                    c.notes = f"{c.notes}\n{line}".strip()
                    changed = True
            have = [t.strip() for t in c.tags.split(",") if t.strip()]
            for t in row.tags:
                if t not in have:
                    have.append(t)
                    changed = True
            c.tags = ", ".join(have)
            updated += changed
            continue
        c = Customer(
            first_name=row.first_name[:100],
            last_name=row.last_name[:100],
            phone=phone,
            email=row.email,
            notes="\n".join(row.notes),
            tags=", ".join(row.tags),
            sms_consent=row.sms_consent,
            source=source,
        )
        if row.created:
            c.created_at = datetime(row.created.year, row.created.month, row.created.day, 12, tzinfo=timezone.utc)
        db.add(c)
        existing[phone] = c
        created += 1
    if dry_run:
        db.rollback()
    else:
        db.commit()
    db.close()
    print(f"{'[dry run] ' if dry_run else ''}{kind}: {len(rows)} rows read")
    print(f"  new customers:     {created}")
    print(f"  already existed:   {len(rows) - created - len(skipped)} ({updated} updated: email, name, note or tag)")
    if dupes:
        print(f"  repeated numbers:  {dupes}")
    print(f"  skipped (no valid phone): {len(skipped)}")
    for s in skipped[:20]:
        print(f"    - {s}")
    if len(skipped) > 20:
        print(f"    ... and {len(skipped) - 20} more")


def main(argv=None) -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("kind", choices=["diary", "fresha"])
    p.add_argument("path", type=Path)
    p.add_argument("--dry-run", action="store_true")
    args = p.parse_args(argv)
    if not args.path.exists():
        sys.exit(f"File not found: {args.path}")
    run(args.kind, args.path, args.dry_run)


if __name__ == "__main__":
    main()
