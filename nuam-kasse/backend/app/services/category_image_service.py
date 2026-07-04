from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
from uuid import uuid4

from PIL import Image, ImageOps, UnidentifiedImageError
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.models.category import Category
from app.models.user import utc_now


ALLOWED_IMAGE_FORMATS = {
    "JPEG": ("jpg", "image/jpeg"),
    "PNG": ("png", "image/png"),
    "WEBP": ("webp", "image/webp"),
}


class CategoryImageError(ValueError):
    def __init__(self, message: str, *, status_code: int = 400):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


@dataclass(frozen=True)
class StoredCategoryImage:
    image_path: str
    image_preview_path: str
    original_name: str
    mime_type: str
    size: int
    width: int
    height: int


def has_custom_image(category: Category) -> bool:
    return bool(category.image_preview_path and category.image_updated_at)


def category_image_url(category: Category) -> str | None:
    if not has_custom_image(category):
        return None
    version = category.image_updated_at.isoformat()
    return f"/api/v1/categories/{category.id}/image?v={version}"


def _storage_root(settings: Settings | None = None) -> Path:
    current_settings = settings or get_settings()
    return Path(current_settings.category_image_storage_path)


def _relative_path(path: Path, settings: Settings | None = None) -> str:
    return path.relative_to(_storage_root(settings)).as_posix()


def _absolute_path(relative_path: str, settings: Settings | None = None) -> Path:
    root = _storage_root(settings).resolve()
    path = (root / relative_path).resolve()
    if root not in path.parents and path != root:
        raise CategoryImageError("Bildpfad ist ungueltig.", status_code=404)
    return path


def _delete_file(relative_path: str | None, settings: Settings | None = None) -> None:
    if not relative_path:
        return
    try:
        path = _absolute_path(relative_path, settings)
    except CategoryImageError:
        return
    try:
        path.unlink(missing_ok=True)
    except OSError:
        return


def _validate_size(content: bytes, settings: Settings) -> None:
    if not content:
        raise CategoryImageError("Das Bild ist leer oder konnte nicht gelesen werden.")
    if len(content) > settings.category_image_max_bytes:
        max_mb = settings.category_image_max_bytes // (1024 * 1024)
        raise CategoryImageError(
            f"Das ausgewaehlte Bild ist zu gross. Bitte verwende eine Datei mit hoechstens {max_mb} MB.",
        )


def _decode_image(content: bytes, settings: Settings) -> tuple[Image.Image, str, str, int, int]:
    Image.MAX_IMAGE_PIXELS = settings.category_image_max_pixels
    try:
        image = Image.open(BytesIO(content))
        image.load()
    except Image.DecompressionBombError as exc:
        raise CategoryImageError("Das Bild ist zu gross fuer die Verarbeitung.") from exc
    except (OSError, UnidentifiedImageError) as exc:
        raise CategoryImageError("Das Bild konnte nicht gelesen werden. Bitte pruefe das Dateiformat.") from exc

    image_format = (image.format or "").upper()
    if image_format not in ALLOWED_IMAGE_FORMATS:
        raise CategoryImageError("Dieses Dateiformat wird nicht unterstuetzt. Erlaubt sind PNG, JPG, JPEG und WEBP.")

    width, height = image.size
    if width <= 0 or height <= 0:
        raise CategoryImageError("Das Bild besitzt ungueltige Abmessungen.")
    if width * height > settings.category_image_max_pixels:
        raise CategoryImageError("Das Bild ist zu gross fuer die Verarbeitung.")

    extension, mime_type = ALLOWED_IMAGE_FORMATS[image_format]
    return image, extension, mime_type, width, height


def _safe_original_name(original_name: str | None) -> str:
    if not original_name:
        return "upload"
    return Path(original_name).name[:255] or "upload"


def _save_image_files(
    *,
    category: Category,
    content: bytes,
    original_name: str | None,
    settings: Settings,
) -> StoredCategoryImage:
    _validate_size(content, settings)
    image, extension, mime_type, width, height = _decode_image(content, settings)

    directory = _storage_root(settings) / str(category.user_id) / str(category.id)
    directory.mkdir(parents=True, exist_ok=True)
    image_id = uuid4().hex
    original_path = directory / f"{image_id}.original.{extension}"
    preview_path = directory / f"{image_id}.preview.webp"

    original_path.write_bytes(content)

    preview = ImageOps.exif_transpose(image)
    if preview.mode not in {"RGB", "RGBA"}:
        preview = preview.convert("RGBA" if "A" in preview.getbands() else "RGB")
    max_px = settings.category_image_preview_max_px
    preview.thumbnail((max_px, max_px), Image.Resampling.LANCZOS)
    preview.save(preview_path, format="WEBP", quality=86, method=6)

    return StoredCategoryImage(
        image_path=_relative_path(original_path, settings),
        image_preview_path=_relative_path(preview_path, settings),
        original_name=_safe_original_name(original_name),
        mime_type=mime_type,
        size=len(content),
        width=width,
        height=height,
    )


def replace_category_image(
    db: Session,
    *,
    category: Category,
    content: bytes,
    original_name: str | None,
    settings: Settings | None = None,
) -> Category:
    current_settings = settings or get_settings()
    old_image_path = category.image_path
    old_preview_path = category.image_preview_path
    stored: StoredCategoryImage | None = None

    try:
        stored = _save_image_files(
            category=category,
            content=content,
            original_name=original_name,
            settings=current_settings,
        )
        category.image_path = stored.image_path
        category.image_preview_path = stored.image_preview_path
        category.image_original_name = stored.original_name
        category.image_mime_type = stored.mime_type
        category.image_size = stored.size
        category.image_width = stored.width
        category.image_height = stored.height
        category.image_updated_at = utc_now()
        category.updated_at = utc_now()
        db.commit()
        db.refresh(category)
    except Exception:
        db.rollback()
        if stored:
            _delete_file(stored.image_path, current_settings)
            _delete_file(stored.image_preview_path, current_settings)
        raise

    _delete_file(old_image_path, current_settings)
    _delete_file(old_preview_path, current_settings)
    return category


def remove_category_image(
    db: Session,
    *,
    category: Category,
    settings: Settings | None = None,
) -> Category:
    current_settings = settings or get_settings()
    old_image_path = category.image_path
    old_preview_path = category.image_preview_path

    category.image_path = None
    category.image_preview_path = None
    category.image_original_name = None
    category.image_mime_type = None
    category.image_size = None
    category.image_width = None
    category.image_height = None
    category.image_updated_at = None
    category.updated_at = utc_now()
    db.commit()
    db.refresh(category)

    _delete_file(old_image_path, current_settings)
    _delete_file(old_preview_path, current_settings)
    return category


def delete_category_image_paths(
    image_path: str | None,
    image_preview_path: str | None,
    settings: Settings | None = None,
) -> None:
    current_settings = settings or get_settings()
    _delete_file(image_path, current_settings)
    _delete_file(image_preview_path, current_settings)


def delete_category_image_files(category: Category, settings: Settings | None = None) -> None:
    delete_category_image_paths(category.image_path, category.image_preview_path, settings)


def get_category_preview_path(category: Category, settings: Settings | None = None) -> Path | None:
    if not category.image_preview_path:
        return None
    path = _absolute_path(category.image_preview_path, settings)
    if not path.is_file():
        return None
    return path
