import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .auth import ensure_admin
from .config import get_settings
from .db import SessionLocal
from .routers import admin_settings, auth, customers, dashboard, inventory, jobs, public

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(_: FastAPI):
    db = SessionLocal()
    try:
        ensure_admin(db)
    finally:
        db.close()
    yield


def create_app() -> FastAPI:
    s = get_settings()
    if not s.database_url.startswith("sqlite") and (s.secret_key == "change-me-in-production" or len(s.secret_key) < 32):
        raise RuntimeError("Set SECRET_KEY in .env to a long random string before running with a real database.")
    s.media_dir.mkdir(parents=True, exist_ok=True)
    app = FastAPI(title="StitchLog API", version="0.1.0", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[o.strip() for o in s.cors_origins.split(",") if o.strip()],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    for r in (auth, customers, jobs, dashboard, inventory, admin_settings, public):
        app.include_router(r.router)
    app.mount(s.media_url, StaticFiles(directory=s.media_dir), name="media")

    @app.get("/api/health", tags=["health"])
    def health():
        return {"ok": True}

    return app


app = create_app()
