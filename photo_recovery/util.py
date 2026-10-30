import shutil
import sqlite3
import tempfile
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

IMAGE_EXTS = {".jpg", ".jpeg", ".heic", ".heif", ".png", ".gif", ".tif", ".tiff",
              ".dng", ".webp", ".avif"}
VIDEO_EXTS = {".mov", ".mp4", ".m4v"}
MEDIA_EXTS = IMAGE_EXTS | VIDEO_EXTS

# Core Data timestamps count seconds from 2001-01-01 UTC.
APPLE_EPOCH = 978307200


def is_media(name):
    return Path(name).suffix.lower() in MEDIA_EXTS


def coredata_to_datetime(value):
    if value is None:
        return None
    try:
        return datetime.fromtimestamp(float(value) + APPLE_EPOCH, tz=timezone.utc)
    except (TypeError, ValueError, OverflowError, OSError):
        return None


def strip_ext(path):
    p = str(path)
    dot = p.rfind(".")
    return p[:dot] if dot > p.rfind("/") else p


@contextmanager
def open_sqlite_copy(db_path, wal_path=None, shm_path=None):
    """Open a SQLite database from a private copy, so the original is never
    touched or locked (Photos may have it open, and backups must stay intact)."""
    db_path = Path(db_path)
    if wal_path is None and Path(f"{db_path}-wal").exists():
        wal_path = f"{db_path}-wal"
    if shm_path is None and Path(f"{db_path}-shm").exists():
        shm_path = f"{db_path}-shm"
    tmp = Path(tempfile.mkdtemp(prefix="photo_recovery_"))
    conn = None
    try:
        target = tmp / "db.sqlite"
        shutil.copyfile(db_path, target)
        if wal_path:
            shutil.copyfile(wal_path, f"{target}-wal")
        if shm_path:
            shutil.copyfile(shm_path, f"{target}-shm")
        conn = sqlite3.connect(str(target))
        conn.row_factory = sqlite3.Row
        yield conn
    finally:
        if conn is not None:
            conn.close()
        shutil.rmtree(tmp, ignore_errors=True)


def human_size(n):
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024 or unit == "GB":
            return f"{n:.0f} {unit}" if unit == "B" else f"{n:.1f} {unit}"
        n /= 1024
