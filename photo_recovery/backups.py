"""Reads local iPhone/iPad backups made by Finder (macOS) or iTunes / Apple Devices (Windows).

A backup folder holds Info.plist, Manifest.plist, Manifest.db and the files
themselves, renamed to SHA-1 hashes. Manifest.db maps each hash back to its
original domain and path (e.g. CameraRollDomain / Media/DCIM/100APPLE/IMG_0001.HEIC).
"""

import os
import plistlib
import sqlite3
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from .util import open_sqlite_copy

CAMERA_ROLL = "CameraRollDomain"
PHOTOS_DB = "Media/PhotoData/Photos.sqlite"


class EncryptedBackupError(Exception):
    pass


def default_backup_roots():
    home = Path.home()
    candidates = [home / "Library" / "Application Support" / "MobileSync" / "Backup"]
    if sys.platform == "win32" or os.environ.get("APPDATA"):
        if os.environ.get("APPDATA"):
            candidates.append(Path(os.environ["APPDATA"]) / "Apple Computer" / "MobileSync" / "Backup")
        candidates.append(home / "Apple" / "MobileSync" / "Backup")  # Microsoft Store iTunes / Apple Devices
    return [p for p in candidates if p.is_dir()]


@dataclass
class BackupInfo:
    path: Path
    device_name: str
    product_type: str
    ios_version: str
    udid: str
    last_backup: datetime | None
    encrypted: bool

    @property
    def label(self):
        when = self.last_backup.strftime("%Y-%m-%d") if self.last_backup else "unknown date"
        return f"{self.device_name} ({when})"


def _read_plist(path):
    try:
        with open(path, "rb") as f:
            return plistlib.load(f)
    except (OSError, plistlib.InvalidFileException, ValueError):
        return {}


def load_backup_info(path):
    path = Path(path)
    info = _read_plist(path / "Info.plist")
    manifest = _read_plist(path / "Manifest.plist")
    last = info.get("Last Backup Date") or manifest.get("Date")
    return BackupInfo(
        path=path,
        device_name=info.get("Device Name") or info.get("Display Name") or path.name,
        product_type=info.get("Product Type", ""),
        ios_version=info.get("Product Version", ""),
        udid=info.get("Unique Identifier") or info.get("Target Identifier") or path.name,
        last_backup=last if isinstance(last, datetime) else None,
        encrypted=bool(manifest.get("IsEncrypted", False)),
    )


def find_backups(roots=None):
    """Return every backup found under the given folders (or the default
    locations). A root may also be a single backup folder."""
    roots = [Path(r) for r in roots] if roots else default_backup_roots()
    found = []
    for root in roots:
        if not root.is_dir():
            continue
        dirs = [root] if _looks_like_backup(root) else [d for d in sorted(root.iterdir()) if d.is_dir()]
        found += [load_backup_info(d) for d in dirs if _looks_like_backup(d)]
    return found


def _looks_like_backup(path):
    return (path / "Manifest.db").exists() or (path / "Manifest.plist").exists()


@dataclass
class BackupFile:
    file_id: str
    domain: str
    relative_path: str
    path: Path

    @property
    def size(self):
        try:
            return self.path.stat().st_size
        except OSError:
            return 0


class Backup:
    def __init__(self, info):
        self.info = info
        if info.encrypted:
            raise EncryptedBackupError(
                f"The backup of {info.label} is encrypted. Turn off 'Encrypt local backup' in "
                "Finder/iTunes (it asks for the backup password), make a new backup, then scan again."
            )
        manifest = info.path / "Manifest.db"
        if not manifest.exists():
            raise FileNotFoundError(f"{manifest} not found (backups from iOS 9 and older are not supported)")
        try:
            with open_sqlite_copy(manifest) as conn:
                rows = conn.execute(
                    "SELECT fileID, domain, relativePath FROM Files WHERE flags = 1"
                ).fetchall()
        except sqlite3.DatabaseError as e:
            raise EncryptedBackupError(
                f"Could not read the file list of {info.label} ({e}). It is probably encrypted."
            ) from e
        self.files = [
            BackupFile(r["fileID"], r["domain"], r["relativePath"], self._file_path(r["fileID"]))
            for r in rows
        ]
        self._index = {(f.domain, f.relative_path): f for f in self.files}

    def _file_path(self, file_id):
        nested = self.info.path / file_id[:2] / file_id
        return nested if nested.exists() else self.info.path / file_id

    def find(self, domain, relative_path):
        f = self._index.get((domain, relative_path))
        return f if f and f.path.exists() else None

    def camera_roll(self):
        return [f for f in self.files if f.domain == CAMERA_ROLL and f.path.exists()]
