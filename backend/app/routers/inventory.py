"""Inventory: stock bought for the shop. What you paid for it is what counts as expenses in Reports."""

from datetime import date
from decimal import Decimal
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session

from .. import schemas
from ..auth import get_current_user
from ..db import get_db
from ..images import InvalidImage, delete_files, media_url, save_photo
from ..models import InventoryItem

router = APIRouter(prefix="/api", tags=["inventory"], dependencies=[Depends(get_current_user)])

Item = InventoryItem
COST = Item.quantity * Item.unit_price
VALUE_LEFT = Item.quantity_left * Item.unit_price
IS_OUT = Item.quantity_left <= 0
IS_LOW = and_(Item.quantity_left > 0, Item.low_stock_at.is_not(None), Item.quantity_left <= Item.low_stock_at)


def _money(v) -> Decimal:
    return Decimal(str(v or 0)).quantize(Decimal("0.01"))


def item_out(i: Item) -> schemas.InventoryOut:
    return schemas.InventoryOut(
        id=i.id,
        section=i.section,
        name=i.name,
        category=i.category,
        supplier=i.supplier,
        bought_on=i.bought_on,
        quantity=i.quantity,
        quantity_left=i.quantity_left,
        unit=i.unit,
        unit_price=i.unit_price,
        total_cost=i.total_cost,
        stock_value=i.stock_value,
        stock_status=i.stock_status,
        low_stock_at=i.low_stock_at,
        buy_url=i.buy_url or "",
        image_url=i.image_url or "",
        payment_method=i.payment_method,
        notes=i.notes,
        receipt_url=media_url(i.receipt_path) if i.receipt_path else "",
        receipt_thumb_url=media_url(i.receipt_thumb_path) if i.receipt_thumb_path else "",
        created_at=i.created_at,
    )


def _get(db: Session, item_id: int) -> Item:
    i = db.get(Item, item_id)
    if i is None:
        raise HTTPException(status_code=404, detail="Item not found")
    return i


@router.get("/inventory", response_model=schemas.InventoryPage)
def list_inventory(
    section: str = Query("shop", pattern="^(shop|beauty)$"),
    q: str = "",
    category: str | None = None,
    stock: str | None = Query(None, pattern="^(in|low|out)$"),
    date_from: date | None = None,
    date_to: date | None = None,
    limit: int = Query(200, le=500),
    offset: int = 0,
    db: Session = Depends(get_db),
):
    where = [Item.section == section]
    if category:
        where.append(Item.category == category)
    if stock == "in":
        where.append(Item.quantity_left > 0)
    elif stock == "low":
        where.append(IS_LOW)
    elif stock == "out":
        where.append(IS_OUT)
    if date_from:
        where.append(Item.bought_on >= date_from)
    if date_to:
        where.append(Item.bought_on <= date_to)
    for word in q.split():
        w = f"%{word.lower()}%"
        where.append(or_(func.lower(Item.name).like(w), func.lower(Item.supplier).like(w), func.lower(Item.notes).like(w)))

    count, cost = db.execute(select(func.count(Item.id), func.coalesce(func.sum(COST), 0)).where(*where)).one()
    rows = db.scalars(select(Item).where(*where).order_by(Item.bought_on.desc(), Item.id.desc()).limit(limit).offset(offset)).all()
    return schemas.InventoryPage(items=[item_out(i) for i in rows], total=count, cost_total=_money(cost))


@router.get("/inventory/overview", response_model=schemas.InventoryOverview)
def inventory_overview(section: str = Query("shop", pattern="^(shop|beauty)$"), db: Session = Depends(get_db)):
    mine = Item.section == section
    value, count = db.execute(select(func.coalesce(func.sum(VALUE_LEFT), 0), func.count(Item.id)).where(mine)).one()
    low = db.scalar(select(func.count(Item.id)).where(mine, IS_LOW))
    out = db.scalar(select(func.count(Item.id)).where(mine, IS_OUT))
    return schemas.InventoryOverview(stock_value=_money(value), item_count=count, low_count=low or 0, out_count=out or 0)


@router.get("/inventory/spend", response_model=schemas.SpendSummary)
def inventory_spend(date_from: date, date_to: date, section: str = Query("shop", pattern="^(shop|beauty)$"), db: Session = Depends(get_db)):
    """Money spent on stock bought between two days (both included). Used as expenses in Reports."""
    rows = db.execute(
        select(Item.category, func.coalesce(func.sum(COST), 0), func.count(Item.id))
        .where(Item.section == section, Item.bought_on >= date_from, Item.bought_on <= date_to)
        .group_by(Item.category)
    ).all()
    by_cat = sorted(
        (schemas.CategoryTotal(category=c or "Other", total=_money(t), count=n) for c, t, n in rows),
        key=lambda x: x.total,
        reverse=True,
    )
    return schemas.SpendSummary(
        date_from=date_from,
        date_to=date_to,
        total=sum((c.total for c in by_cat), Decimal("0")),
        count=sum(c.count for c in by_cat),
        by_category=by_cat,
    )


@router.get("/inventory/categories", response_model=list[str])
def used_categories(section: str = Query("shop", pattern="^(shop|beauty)$"), db: Session = Depends(get_db)):
    stmt = select(Item.category).where(Item.section == section).distinct().order_by(Item.category)
    return [c for c in db.scalars(stmt).all() if c]


@router.get("/inventory/{item_id}", response_model=schemas.InventoryOut)
def get_item(item_id: int, db: Session = Depends(get_db)):
    return item_out(_get(db, item_id))


@router.post("/inventory", response_model=schemas.InventoryOut, status_code=201)
def create_item(body: schemas.InventoryIn, db: Session = Depends(get_db)):
    data = body.model_dump()
    if data["quantity_left"] is None:
        data["quantity_left"] = data["quantity"]
    i = Item(**data)
    db.add(i)
    db.commit()
    return item_out(i)


@router.put("/inventory/{item_id}", response_model=schemas.InventoryOut)
def update_item(item_id: int, body: schemas.InventoryIn, db: Session = Depends(get_db)):
    i = _get(db, item_id)
    data = body.model_dump()
    if data["quantity_left"] is None:
        data.pop("quantity_left")
    for k, v in data.items():
        setattr(i, k, v)
    db.commit()
    return item_out(i)


@router.post("/inventory/{item_id}/stock", response_model=schemas.InventoryOut)
def change_stock(item_id: int, body: schemas.StockChange, db: Session = Depends(get_db)):
    """Quick +/- from the list, e.g. used one zip."""
    i = _get(db, item_id)
    i.quantity_left = max((i.quantity_left or Decimal("0")) + body.change, Decimal("0"))
    db.commit()
    return item_out(i)


@router.delete("/inventory/{item_id}", status_code=204)
def delete_item(item_id: int, db: Session = Depends(get_db)):
    i = _get(db, item_id)
    paths = (i.receipt_path, i.receipt_thumb_path)
    db.delete(i)
    db.commit()
    delete_files(*paths)


# ---------- receipt photo ----------
@router.post("/inventory/{item_id}/receipt", response_model=schemas.InventoryOut)
async def upload_receipt(item_id: int, file: UploadFile = File(...), db: Session = Depends(get_db)):
    i = _get(db, item_id)
    data = await file.read()
    try:
        info = save_photo(data, Path("inventory") / str(i.id))
    except InvalidImage as err:
        raise HTTPException(status_code=422, detail=str(err)) from None
    old = (i.receipt_path, i.receipt_thumb_path)
    i.receipt_path = info["path"]
    i.receipt_thumb_path = info["thumb_path"]
    db.commit()
    delete_files(*old)
    return item_out(i)


@router.delete("/inventory/{item_id}/receipt", response_model=schemas.InventoryOut)
def delete_receipt(item_id: int, db: Session = Depends(get_db)):
    i = _get(db, item_id)
    old = (i.receipt_path, i.receipt_thumb_path)
    i.receipt_path = ""
    i.receipt_thumb_path = ""
    db.commit()
    delete_files(*old)
    return item_out(i)
