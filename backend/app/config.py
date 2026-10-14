from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BASE_DIR / ".env", extra="ignore")

    # Database. SQLite works for local dev; use PostgreSQL in production, e.g.
    # postgresql+psycopg://stitchlog:secret@localhost:5432/stitchlog
    database_url: str = f"sqlite:///{BASE_DIR / 'stitchlog.db'}"

    # Auth
    secret_key: str = "change-me-in-production"
    access_token_minutes: int = 60 * 24 * 14  # stay logged in for 2 weeks on the shop phone
    admin_email: str | None = None  # bootstraps the first admin user on startup
    admin_password: str | None = None

    # Where uploaded photos are stored
    media_dir: Path = BASE_DIR / "media"
    media_url: str = "/media"

    # Public URL of the frontend, used to build the customer's job page link
    public_base_url: str = "http://localhost:5173"
    cors_origins: str = "http://localhost:5173"

    # Job numbers look like SL-0042
    job_number_prefix: str = "SL"
    timezone: str = "Europe/Dublin"
    default_country_code: str = "353"  # Ireland

    # Notifications: "console" (log only), "twilio_sms" or "twilio_whatsapp"
    notify_provider: str = "console"
    twilio_account_sid: str | None = None
    twilio_auth_token: str | None = None
    twilio_from: str | None = None  # e.g. +353861234567 or whatsapp:+14155238886


@lru_cache
def get_settings() -> Settings:
    return Settings()
