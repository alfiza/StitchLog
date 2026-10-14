"""Attach your own shelf photos to Nails & Brows products that have no shop picture.

Run from the backend folder:  python -m scripts.add_beauty_photos
Only touches products with no shop picture and no photo yet, so it's safe to run twice.
"""

from pathlib import Path

from sqlalchemy import select

from app.db import SessionLocal
from app.images import save_photo
from app.models import InventoryItem

PHOTOS = {
    "Oshea Professionals Gold Massage Cream 300g": "oshea_gold_massage.jpg",
    "Oshea Professionals Gold Pack 300g": "oshea_gold_pack.jpg",
    "Oshea Professionals Diamond Mask 300g": "oshea_diamond.jpg",
    "Oshea Professionals Fruitmix Scrub 300g": "oshea_fruitmix.jpg",
    "Oshea Professionals Pearl Massage Cream 300g": "oshea_pearl.jpg",
    "O3+ Professional D-Tan Pack 300g": "o3_dtan.jpg",
    "Aroma Leafs Diamond Facial Pack 500ml": "aroma_diamond.jpg",
    "Aroma Leafs 24K Gold Face Pack": "aroma_24k.jpg",
    "Aroma Leafs Fresh Fruit Facial Scrub": "aroma_fresh.jpg",
    "Luxury 24K Gold Anti-ageing Crystal Jelly Mask 300g": "luxury_24k.jpg",
    "St. Ives Gentle Smoothing Oatmeal Scrub & Mask 150ml": "st_ives.jpg",
}


def main() -> None:
    folder = Path(__file__).parent / "beauty_photos"
    db = SessionLocal()
    done = skipped = 0
    try:
        for name, file in PHOTOS.items():
            item = db.scalar(select(InventoryItem).where(InventoryItem.section == "beauty", InventoryItem.name == name))
            if item is None or item.image_url or item.receipt_path:
                skipped += 1
                continue
            info = save_photo((folder / file).read_bytes(), Path("inventory") / str(item.id))
            item.receipt_path = info["path"]
            item.receipt_thumb_path = info["thumb_path"]
            done += 1
        db.commit()
    finally:
        db.close()
    print(f"Photos added to {done} products ({skipped} skipped).")


if __name__ == "__main__":
    main()
