from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import schemas, settings_store
from ..auth import get_current_user
from ..db import get_db
from ..models import Service

router = APIRouter(prefix="/api", tags=["settings"], dependencies=[Depends(get_current_user)])


# ---------- business settings ----------
@router.get("/settings", response_model=dict[str, str])
def get_settings_(db: Session = Depends(get_db)):
    return settings_store.get_all(db)


@router.put("/settings", response_model=dict[str, str])
def put_settings(body: dict[str, str], db: Session = Depends(get_db)):
    return settings_store.update(db, body)


# ---------- price list ----------
@router.get("/services", response_model=list[schemas.ServiceOut])
def list_services(include_inactive: bool = False, db: Session = Depends(get_db)):
    stmt = select(Service).order_by(Service.sort_order, Service.name)
    if not include_inactive:
        stmt = stmt.where(Service.active.is_(True))
    return db.scalars(stmt).all()


@router.post("/services", response_model=schemas.ServiceOut, status_code=201)
def create_service(body: schemas.ServiceIn, db: Session = Depends(get_db)):
    s = Service(**body.model_dump())
    db.add(s)
    db.commit()
    return s


@router.put("/services/{service_id}", response_model=schemas.ServiceOut)
def update_service(service_id: int, body: schemas.ServiceIn, db: Session = Depends(get_db)):
    s = db.get(Service, service_id)
    if s is None:
        raise HTTPException(status_code=404, detail="Service not found")
    for k, v in body.model_dump().items():
        setattr(s, k, v)
    db.commit()
    return s


@router.delete("/services/{service_id}", status_code=204)
def delete_service(service_id: int, db: Session = Depends(get_db)):
    s = db.get(Service, service_id)
    if s is None:
        raise HTTPException(status_code=404, detail="Service not found")
    db.delete(s)
    db.commit()
