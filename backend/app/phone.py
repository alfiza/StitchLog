"""Phone number normalisation.

Everything is stored in E.164 form (+353871234567) so the same customer is found
whether you type 087 123 4567, 0871234567, 353871234567 or +353 87 123 4567.
"""

import re

from .config import get_settings


class InvalidPhone(ValueError):
    pass


def normalise_phone(raw: str | None, country_code: str | None = None) -> str:
    if raw is None:
        raise InvalidPhone("Phone number is required")
    cc = country_code or get_settings().default_country_code
    text = str(raw).strip()
    if text.endswith(".0"):  # numbers that went through a spreadsheet as floats
        text = text[:-2]
    has_plus = text.startswith("+")
    digits = re.sub(r"\D", "", text)
    if not digits:
        raise InvalidPhone("Phone number is required")

    if has_plus:
        number = digits
    elif digits.startswith("00"):
        number = digits[2:]
    elif digits.startswith("0"):
        number = cc + digits[1:]
    elif digits.startswith(cc) and len(digits) >= len(cc) + 7:
        number = digits
    elif len(digits) == 9 and digits.startswith("8"):
        # Irish mobile typed without the leading 0 (e.g. 871234567)
        number = cc + digits
    else:
        number = digits

    if not 8 <= len(number) <= 15:
        raise InvalidPhone(f"'{raw}' does not look like a valid phone number")
    return "+" + number


def phone_search_digits(raw: str) -> str:
    """Digits to use for a partial 'contains' search (drops a leading 0)."""
    digits = re.sub(r"\D", "", raw or "")
    return digits[1:] if digits.startswith("0") else digits


def display_phone(e164: str | None) -> str:
    """+353871234567 -> 087 123 4567 for Irish numbers, unchanged otherwise."""
    if not e164:
        return ""
    cc = "+" + get_settings().default_country_code
    if e164.startswith(cc):
        local = "0" + e164[len(cc):]
        if len(local) == 10:
            return f"{local[:3]} {local[3:6]} {local[6:]}"
        return local
    return e164


def whatsapp_number(e164: str) -> str:
    return e164.lstrip("+")
