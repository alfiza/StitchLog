import os
import tempfile
from pathlib import Path

_tmp = Path(tempfile.mkdtemp(prefix="stitchlog-test-"))
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_tmp / 'test.db'}")
os.environ["MEDIA_DIR"] = str(_tmp / "media")
os.environ["SECRET_KEY"] = "test-secret-key-that-is-long-enough-for-hs256"
os.environ["PUBLIC_BASE_URL"] = "https://shop.example"
os.environ["NOTIFY_PROVIDER"] = "console"
os.environ.pop("ADMIN_EMAIL", None)

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.auth import hash_password  # noqa: E402
from app.db import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import User  # noqa: E402


@pytest.fixture(autouse=True)
def fresh_db():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    db = SessionLocal()
    db.add(User(email="owner@example.com", name="Owner", password_hash=hash_password("secret123")))
    db.commit()
    db.close()
    yield


@pytest.fixture
def anon():
    return TestClient(app)


@pytest.fixture
def client(anon):
    r = anon.post("/api/auth/login", json={"email": "owner@example.com", "password": "secret123"})
    assert r.status_code == 200, r.text
    anon.headers["Authorization"] = f"Bearer {r.json()['access_token']}"
    return anon


@pytest.fixture
def customer(client):
    r = client.post("/api/customers", json={"first_name": "Aoife", "last_name": "Byrne", "phone": "087 123 4567"})
    assert r.status_code == 201, r.text
    return r.json()


def make_job(client, customer_id, **extra):
    body = {
        "customer_id": customer_id,
        "due_date": "2026-10-20",
        "deposit": 10,
        "items": [
            {"garment_type": "Dress", "colour": "Red", "details": "Take in waist 2cm", "original_price": 120, "job_price": 25},
            {"garment_type": "Trousers", "colour": "Black", "details": "Hem 3cm", "job_price": 15},
        ],
    }
    body.update(extra)
    r = client.post("/api/jobs", json=body)
    assert r.status_code == 201, r.text
    return r.json()
