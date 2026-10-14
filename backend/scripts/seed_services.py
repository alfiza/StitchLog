"""Add a starter price list (edit prices afterwards in Settings > Price list).

    python -m scripts.seed_services
"""

from decimal import Decimal

from app.db import SessionLocal
from app.models import Service

STARTER = [
    ("Hem trousers", "Trousers", 15),
    ("Hem jeans (keep original hem)", "Jeans", 20),
    ("Take in / let out trousers waist", "Trousers", 20),
    ("Shorten dress", "Dress", 25),
    ("Take in dress", "Dress", 30),
    ("Shorten sleeves", "Jacket", 25),
    ("Zip replacement", "", 20),
    ("Wedding dress alterations", "Wedding dress", 120),
    ("Saree blouse stitching", "Saree blouse", 35),
    ("Lehenga alterations", "Lehenga", 40),
    ("Curtain hemming (per panel)", "Curtains", 20),
]


def main() -> None:
    db = SessionLocal()
    if db.query(Service).count():
        print("Price list already has items, nothing added.")
        return
    for i, (name, garment, price) in enumerate(STARTER):
        db.add(Service(name=name, garment_type=garment, price_from=Decimal(price), sort_order=i))
    db.commit()
    print(f"Added {len(STARTER)} services.")


if __name__ == "__main__":
    main()
