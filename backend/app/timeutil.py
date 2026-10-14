from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from .config import get_settings


def tz() -> ZoneInfo:
    return ZoneInfo(get_settings().timezone)


def today_local() -> date:
    return datetime.now(tz()).date()


def local_day_start_utc(d: date) -> datetime:
    return datetime.combine(d, time.min, tzinfo=tz()).astimezone(timezone.utc)


def week_start(d: date) -> date:
    return d - timedelta(days=d.weekday())  # Monday
