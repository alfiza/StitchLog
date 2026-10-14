"""Add the Nails & Brows stock list (scripts/beauty_stock.json) to the database.

Run from the backend folder:  python -m scripts.add_beauty_stock
Safe to run twice: products already in Nails & Brows (same name) are skipped.
"""

import json
from datetime import date
from decimal import Decimal
from pathlib import Path

from sqlalchemy import select

from app.db import SessionLocal
from app.models import InventoryItem


def main() -> None:
    items = json.loads((Path(__file__).parent / "beauty_stock.json").read_text(encoding="utf-8"))
    db = SessionLocal()
    added = skipped = 0
    try:
        existing = set(db.scalars(select(InventoryItem.name).where(InventoryItem.section == "beauty")).all())
        for it in items:
            if it["name"] in existing:
                skipped += 1
                continue
            qty = Decimal(str(it["quantity"]))
            db.add(
                InventoryItem(
                    section="beauty",
                    name=it["name"],
                    category=it["category"],
                    supplier=it.get("supplier", ""),
                    bought_on=date.today(),
                    quantity=qty,
                    quantity_left=qty,
                    unit=it.get("unit", "pcs"),
                    unit_price=Decimal(str(it["unit_price"])),
                    buy_url=it.get("buy_url", ""),
                    image_url=it.get("image_url", ""),
                    notes=it.get("notes", ""),
                )
            )
            added += 1
        db.commit()
    finally:
        db.close()
    print(f"Nails & Brows stock: {added} added, {skipped} already there.")


if __name__ == "__main__":
    main()
