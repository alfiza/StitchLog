from io import BytesIO

import pytest
from PIL import Image

from app.phone import InvalidPhone, display_phone, normalise_phone

from .conftest import make_job


# ---------- phone numbers ----------
@pytest.mark.parametrize(
    "raw,expected",
    [
        ("087 123 4567", "+353871234567"),
        ("0871234567", "+353871234567"),
        ("871234567", "+353871234567"),
        ("353871234567", "+353871234567"),
        ("+353 (0)87-123-4567".replace("(0)", ""), "+353871234567"),
        ("00353871234567", "+353871234567"),
        ("+447400786006", "+447400786006"),
        ("871234567.0", "+353871234567"),
        ("01 872 1234", "+35318721234"),
    ],
)
def test_normalise_phone(raw, expected):
    assert normalise_phone(raw) == expected


@pytest.mark.parametrize("raw", ["", "abc", "123", None])
def test_invalid_phone(raw):
    with pytest.raises(InvalidPhone):
        normalise_phone(raw)


def test_display_phone():
    assert display_phone("+353871234567") == "087 123 4567"
    assert display_phone("+447400786006") == "+447400786006"


# ---------- auth ----------
def test_login_required(anon):
    assert anon.get("/api/customers").status_code == 401
    assert anon.post("/api/auth/login", json={"email": "owner@example.com", "password": "nope"}).status_code == 401


def test_me(client):
    assert client.get("/api/auth/me").json()["email"] == "owner@example.com"


# ---------- customers ----------
def test_customer_lookup_any_format(client, customer):
    for typed in ("0871234567", "+353 87 123 4567", "87 123 4567"):
        r = client.get("/api/customers/lookup", params={"phone": typed})
        assert r.status_code == 200
        assert r.json()["id"] == customer["id"]
    assert client.get("/api/customers/lookup", params={"phone": "0870000000"}).status_code == 404


def test_duplicate_phone_rejected(client, customer):
    r = client.post("/api/customers", json={"first_name": "Other", "phone": "+353871234567"})
    assert r.status_code == 409
    assert r.json()["detail"]["customer_id"] == customer["id"]


def test_customer_search(client, customer):
    client.post("/api/customers", json={"first_name": "Sarah", "last_name": "Kelly", "phone": "0851580188"})
    by_name = client.get("/api/customers", params={"q": "aoife"}).json()
    assert [c["first_name"] for c in by_name["items"]] == ["Aoife"]
    by_full = client.get("/api/customers", params={"q": "sarah kel"}).json()
    assert [c["first_name"] for c in by_full["items"]] == ["Sarah"]
    by_phone = client.get("/api/customers", params={"q": "085158"}).json()
    assert [c["first_name"] for c in by_phone["items"]] == ["Sarah"]
    assert client.get("/api/customers").json()["total"] == 2


def test_measurements(client, customer):
    cid = customer["id"]
    r = client.put(f"/api/customers/{cid}/measurements", json=[{"label": "Waist", "value": 72}, {"label": "Bust", "value": 90}])
    assert {m["label"] for m in r.json()} == {"Waist", "Bust"}
    r = client.put(f"/api/customers/{cid}/measurements", json=[{"label": "Waist", "value": 74}])
    assert [(m["label"], m["value"]) for m in r.json()] == [("Waist", 74.0)]


# ---------- jobs ----------
def test_create_job_with_items_and_numbering(client, customer):
    job = make_job(client, customer["id"])
    assert job["job_number"] == "SL-0001"
    assert job["status"] == "received"
    assert job["total_price"] == 40.0
    assert job["balance_due"] == 30.0
    assert [i["garment_type"] for i in job["items"]] == ["Dress", "Trousers"]
    assert job["public_url"] == f"https://shop.example/j/{job['public_token']}"
    assert job["whatsapp_url"].startswith("https://wa.me/353871234567?text=")
    assert make_job(client, customer["id"])["job_number"] == "SL-0002"


def test_job_history_newest_first(client, customer):
    first = make_job(client, customer["id"])
    second = make_job(client, customer["id"])
    detail = client.get(f"/api/customers/{customer['id']}").json()
    assert [j["id"] for j in detail["jobs"]] == [second["id"], first["id"]]
    assert detail["jobs"][0]["items_label"] == "Dress, Trousers"


def test_edit_job_items_keeps_existing(client, customer):
    job = make_job(client, customer["id"])
    keep = job["items"][0]
    r = client.patch(
        f"/api/jobs/{job['id']}",
        json={"paid": True, "items": [{**keep, "job_price": 30}, {"garment_type": "Blouse", "job_price": 12}]},
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["items"][0]["id"] == keep["id"]
    assert [i["garment_type"] for i in data["items"]] == ["Dress", "Blouse"]
    assert data["total_price"] == 42.0 and data["balance_due"] == 0.0


def test_status_flow_sends_ready_message(client, customer):
    job = make_job(client, customer["id"])
    r = client.post(f"/api/jobs/{job['id']}/status", json={"status": "in_progress"})
    assert r.json()["messages"] == []
    r = client.post(f"/api/jobs/{job['id']}/status", json={"status": "ready"})
    data = r.json()
    assert data["ready_at"] is not None
    assert len(data["messages"]) == 1
    msg = data["messages"][0]
    assert msg["status"] == "logged" and msg["to"] == "+353871234567"
    assert "Aoife" in msg["body"] and "SL-0001" in msg["body"] and data["public_url"] in msg["body"]
    assert "€30.00" in msg["body"]
    # setting ready again does not send twice
    assert len(client.post(f"/api/jobs/{job['id']}/status", json={"status": "ready"}).json()["messages"]) == 1
    r = client.post(f"/api/jobs/{job['id']}/status", json={"status": "collected"})
    assert r.json()["collected_at"] is not None


def test_ready_without_notify(client, customer):
    job = make_job(client, customer["id"])
    r = client.post(f"/api/jobs/{job['id']}/status", json={"status": "ready", "notify": False})
    assert r.json()["messages"] == []


def test_message_template_from_settings(client, customer):
    client.put(
        "/api/settings",
        json={"business_name": "Test Tailor", "ready_message": "Hey {first_name}! {job_number} ready. {job_link}", "google_review_url": ""},
    )
    job = make_job(client, customer["id"])
    body = client.post(f"/api/jobs/{job['id']}/status", json={"status": "ready"}).json()["messages"][0]["body"]
    assert body == f"Hey Aoife! SL-0001 ready. https://shop.example/j/{job['public_token']}"


def test_job_search_and_filters(client, customer):
    job = make_job(client, customer["id"], due_date="2020-01-01")
    assert client.get("/api/jobs", params={"q": "sl-0001"}).json()["total"] == 1
    assert client.get("/api/jobs", params={"q": "aoife"}).json()["total"] == 1
    assert client.get("/api/jobs", params={"due": "overdue"}).json()["total"] == 1
    assert client.get("/api/jobs", params={"status": ["ready"]}).json()["total"] == 0
    assert client.get(f"/api/jobs/by-number/sl-0001").json()["id"] == job["id"]


def _jpeg(color="red", size=(2400, 1200)) -> bytes:
    buf = BytesIO()
    Image.new("RGB", size, color).save(buf, "JPEG")
    return buf.getvalue()


def test_photo_upload_and_delete(client, customer):
    job = make_job(client, customer["id"])
    item_id = job["items"][0]["id"]
    r = client.post(
        f"/api/job-items/{item_id}/photos",
        data={"type": "before"},
        files=[("files", ("a.jpg", _jpeg(), "image/jpeg")), ("files", ("b.jpg", _jpeg("blue"), "image/jpeg"))],
    )
    assert r.status_code == 201, r.text
    photos = r.json()
    assert len(photos) == 2
    assert photos[0]["url"].endswith(".webp") and photos[0]["width"] == 1600
    assert client.get(photos[0]["url"]).status_code == 200
    assert client.get(photos[0]["thumb_url"]).status_code == 200
    bad = client.post(f"/api/job-items/{item_id}/photos", data={"type": "after"}, files=[("files", ("x.jpg", b"nope", "image/jpeg"))])
    assert bad.status_code == 422
    assert client.delete(f"/api/photos/{photos[0]['id']}").status_code == 204
    assert client.get(photos[0]["url"]).status_code == 404
    assert len(client.get(f"/api/jobs/{job['id']}").json()["items"][0]["photos"]) == 1


# ---------- public job page ----------
def test_public_job_page_and_review(anon, client, customer):
    job = make_job(client, customer["id"])
    token = job["public_token"]
    r = anon.get(f"/api/public/jobs/{token}")
    assert r.status_code == 200
    assert r.headers["x-robots-tag"].startswith("noindex")
    data = r.json()
    assert data["first_name"] == "Aoife" and data["job_number"] == "SL-0001"
    assert "phone" not in data and "last_name" not in data  # no personal details beyond first name
    assert anon.get("/api/public/jobs/not-a-real-token-123").status_code == 404

    r = anon.post(f"/api/public/jobs/{token}/review", json={"rating": 5, "comment": "Perfect fit!"})
    assert r.status_code == 201 and r.json()["review"]["rating"] == 5
    assert anon.post(f"/api/public/jobs/{token}/review", json={"rating": 1}).status_code == 409
    assert anon.post(f"/api/public/jobs/{token}/review", json={"rating": 9}).status_code in (409, 422)

    review_id = client.get("/api/reviews").json()[0]["id"]
    assert client.patch(f"/api/reviews/{review_id}", json={"show_on_website": True}).json()["show_on_website"]


# ---------- dashboard ----------
def test_dashboard(client, customer):
    from app.timeutil import today_local

    today = today_local().isoformat()
    j1 = make_job(client, customer["id"], due_date=today)
    make_job(client, customer["id"], due_date="2020-01-01")
    j3 = make_job(client, customer["id"])
    client.post(f"/api/jobs/{j3['id']}/status", json={"status": "ready"})
    j4 = make_job(client, customer["id"])
    client.post(f"/api/jobs/{j4['id']}/status", json={"status": "collected"})
    client.post(f"/api/public/jobs/{j1['public_token']}/review", json={"rating": 4})

    d = client.get("/api/dashboard").json()
    assert [j["id"] for j in d["due_today"]] == [j1["id"]]
    assert len(d["overdue"]) == 1
    assert [j["id"] for j in d["ready_not_collected"]] == [j3["id"]]
    assert d["week_income"] == 40.0
    assert d["week_jobs_in"] == 4
    assert d["average_rating"] == 4.0 and d["customer_count"] == 1


# ---------- GDPR delete ----------
def test_delete_customer_removes_everything(client, customer):
    job = make_job(client, customer["id"])
    photo = client.post(
        f"/api/job-items/{job['items'][0]['id']}/photos",
        data={"type": "after"},
        files=[("files", ("a.jpg", _jpeg(), "image/jpeg"))],
    ).json()[0]
    assert client.delete(f"/api/customers/{customer['id']}").status_code == 204
    assert client.get(f"/api/jobs/{job['id']}").status_code == 404
    assert client.get(photo["url"]).status_code == 404
    assert client.get(f"/api/public/jobs/{job['public_token']}").status_code == 404


# ---------- price list ----------
def test_services(client):
    r = client.post("/api/services", json={"name": "Hem trousers", "garment_type": "Trousers", "price_from": 15})
    sid = r.json()["id"]
    client.post("/api/services", json={"name": "Old", "active": False})
    assert [s["name"] for s in client.get("/api/services").json()] == ["Hem trousers"]
    assert len(client.get("/api/services", params={"include_inactive": True}).json()) == 2
    r = client.put(f"/api/services/{sid}", json={"name": "Hem trousers", "price_from": 18})
    assert r.json()["price_from"] == 18.0
