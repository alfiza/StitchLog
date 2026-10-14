"""Photo processing: fix phone rotation, strip EXIF/GPS, resize, save as WebP + thumbnail."""

import uuid
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageOps, UnidentifiedImageError

from .config import get_settings

MAX_SIDE = 1600
THUMB_SIDE = 400
MAX_UPLOAD_BYTES = 25 * 1024 * 1024
ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP", "HEIF", "MPO", "GIF"}

try:  # iPhone HEIC photos, if pillow-heif is installed
    from pillow_heif import register_heif_opener

    register_heif_opener()
except ImportError:  # pragma: no cover
    pass


class InvalidImage(ValueError):
    pass


def save_job_photo(data: bytes, job_id: int) -> dict:
    return save_photo(data, Path("jobs") / str(job_id))


def save_photo(data: bytes, rel_dir: Path) -> dict:
    """Save an uploaded photo under media_dir/rel_dir as WebP + thumbnail."""
    if len(data) > MAX_UPLOAD_BYTES:
        raise InvalidImage("Photo is too large (max 25 MB)")
    try:
        img = Image.open(BytesIO(data))
        fmt = img.format
        img.load()
    except (UnidentifiedImageError, OSError) as e:
        raise InvalidImage("That file is not a photo we can read") from e
    if fmt not in ALLOWED_FORMATS:
        raise InvalidImage(f"Unsupported image type: {fmt}")

    img = ImageOps.exif_transpose(img)  # phone photos come rotated
    if img.mode not in ("RGB", "RGBA"):
        img = img.convert("RGB")

    media = get_settings().media_dir
    (media / rel_dir).mkdir(parents=True, exist_ok=True)
    name = uuid.uuid4().hex  # random name so photo URLs can't be guessed

    full = img.copy()
    full.thumbnail((MAX_SIDE, MAX_SIDE), Image.Resampling.LANCZOS)
    full_rel = rel_dir / f"{name}.webp"
    full.save(media / full_rel, "WEBP", quality=82, method=4)  # re-encoding drops EXIF (incl. GPS)

    thumb = img.copy()
    thumb.thumbnail((THUMB_SIDE, THUMB_SIDE), Image.Resampling.LANCZOS)
    thumb_rel = rel_dir / f"{name}_t.webp"
    thumb.save(media / thumb_rel, "WEBP", quality=75, method=4)

    return {
        "path": full_rel.as_posix(),
        "thumb_path": thumb_rel.as_posix(),
        "width": full.width,
        "height": full.height,
    }


def delete_files(*rel_paths: str) -> None:
    media = get_settings().media_dir
    for rel in rel_paths:
        if rel:
            (media / rel).unlink(missing_ok=True)


def media_url(rel_path: str) -> str:
    return f"{get_settings().media_url.rstrip('/')}/{rel_path}"
