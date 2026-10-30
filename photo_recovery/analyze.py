"""Works out which photos in a backup or Mac library count as deleted."""

import sqlite3
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path, PurePosixPath

from .backups import CAMERA_ROLL, PHOTOS_DB
from .photos_db import read_assets
from .util import is_media, open_sqlite_copy, strip_ext

CATEGORIES = {
    "recently_deleted": (
        "Recently Deleted",
        "Photos that were in the \"Recently Deleted\" album when the backup or library was saved.",
    ),
    "not_in_library": (
        "Removed from library",
        "The photo file is still there, but the Photos library no longer lists it.",
    ),
    "missing_from_newer_backup": (
        "Deleted since an older backup",
        "In an older backup of the device, but gone from the newest one.",
    ),
    "thumbnail_only": (
        "Thumbnail only",
        "The full photo is gone, but a smaller preview image survived.",
    ),
    "carved": (
        "Recovered from raw data",
        "Rebuilt by scanning a disk image or memory card byte by byte. Names and dates are lost.",
    ),
}


@dataclass
class Finding:
    category: str
    source: Path                 # file on disk to copy from (never modified)
    name: str                    # original file name, e.g. IMG_0001.HEIC
    origin: str                  # where it came from, shown in the report
    original_path: str = ""      # path inside the device / library
    date: datetime | None = None
    notes: list = field(default_factory=list)


def _assets_from_backup(backup):
    db = backup.find(CAMERA_ROLL, PHOTOS_DB)
    if db is None:
        return None
    wal = backup.find(CAMERA_ROLL, PHOTOS_DB + "-wal")
    try:
        with open_sqlite_copy(db.path, wal.path if wal else None, None) as conn:
            return read_assets(conn)
    except (sqlite3.DatabaseError, ValueError):
        return None


def analyze_backup(backup, warn=print):
    """Find recently-deleted, unlisted and thumbnail-only photos in one backup."""
    label = backup.info.label
    roll = backup.camera_roll()
    dcim = {f.relative_path: f for f in roll
            if f.relative_path.startswith("Media/DCIM/") and is_media(f.relative_path)}
    if not dcim:
        warn(f"  {label}: no camera roll in this backup. If iCloud Photos is on, photos are "
             "stored in iCloud instead of the backup (check icloud.com > Photos > Recently Deleted).")

    findings = []
    assets = _assets_from_backup(backup)
    if assets is None:
        if dcim:
            warn(f"  {label}: Photos database missing or unreadable, so deleted photos can't be told "
                 "apart. Use 'compare' across backups, or 'export-all'.")
    else:
        # ZDIRECTORY is relative to Media/, e.g. "DCIM/100APPLE". Live Photo videos and
        # other companions share the asset's name stem, so match on that.
        kept = {strip_ext(f"Media/{a.relpath}") for a in assets if not a.trashed}
        trashed = {strip_ext(f"Media/{a.relpath}"): a for a in assets if a.trashed}
        for rel, f in sorted(dcim.items()):
            stem = strip_ext(rel)
            if stem in trashed:
                a = trashed[stem]
                notes = [f"deleted {a.trashed_date:%Y-%m-%d}"] if a.trashed_date else []
                findings.append(Finding("recently_deleted", f.path, PurePosixPath(rel).name, label,
                                        rel, a.created_date, notes))
            elif stem not in kept:
                findings.append(Finding("not_in_library", f.path, PurePosixPath(rel).name, label, rel))

    findings += _thumbnail_only(roll, dcim, label)
    return findings


def _thumbnail_only(roll, dcim, label):
    # e.g. Media/PhotoData/Thumbnails/V2/DCIM/100APPLE/IMG_0001.HEIC/5005.JPG
    dcim_stems = {strip_ext(r) for r in dcim}
    best = {}
    for f in roll:
        rel = f.relative_path
        if not rel.startswith("Media/PhotoData/Thumbnails/") or "/DCIM/" not in rel or not is_media(rel):
            continue
        parts = rel[rel.index("/DCIM/") + 1:].split("/")
        if len(parts) < 3:
            continue
        original = "Media/" + "/".join(parts[:3])
        if strip_ext(original) in dcim_stems:
            continue
        if original not in best or f.size > best[original].size:
            best[original] = f
    return [
        Finding("thumbnail_only", f.path, f"{strip_ext(PurePosixPath(orig).name)}_thumb{Path(f.relative_path).suffix}",
                label, orig)
        for orig, f in sorted(best.items())
    ]


def compare_backups(backups):
    """Photos present in an older backup of a device but missing from its newest one."""
    by_device = {}
    for b in backups:
        by_device.setdefault(b.info.udid, []).append(b)
    findings = []
    for group in by_device.values():
        if len(group) < 2:
            continue
        group.sort(key=lambda b: b.info.last_backup or datetime.min)
        newest = group[-1]
        newest_stems = {strip_ext(f.relative_path) for f in newest.camera_roll()
                        if f.relative_path.startswith("Media/DCIM/")}
        seen = set()
        for old in reversed(group[:-1]):
            for f in old.camera_roll():
                rel = f.relative_path
                if not rel.startswith("Media/DCIM/") or not is_media(rel):
                    continue
                key = (rel, f.size)
                if strip_ext(rel) in newest_stems or key in seen:
                    continue
                seen.add(key)
                findings.append(Finding("missing_from_newer_backup", f.path, PurePosixPath(rel).name,
                                        old.info.label, rel,
                                        notes=[f"not in backup of {newest.info.label}"]))
    return findings


def export_all_backup(backup):
    """Every camera-roll file, for backups where the Photos database can't be read."""
    return [Finding("not_in_library", f.path, PurePosixPath(f.relative_path).name, backup.info.label,
                    f.relative_path, notes=["unclassified (export-all)"])
            for f in backup.camera_roll()
            if f.relative_path.startswith("Media/DCIM/") and is_media(f.relative_path)]


def default_mac_library():
    return Path.home() / "Pictures" / "Photos Library.photoslibrary"


def analyze_mac_library(library):
    """Recently Deleted items and unlisted originals in a Mac Photos library."""
    library = Path(library)
    db = library / "database" / "Photos.sqlite"
    if not db.exists():
        raise FileNotFoundError(f"{db} not found. Is this a Photos library?")
    with open_sqlite_copy(db) as conn:
        assets = read_assets(conn)
    roots = [library / "originals", library / "Masters"]   # macOS 10.15+ / older
    label = f"Mac library {library.name}"
    findings, known = [], set()
    for a in assets:
        for root in roots:
            path = root / a.directory / a.filename
            if path.exists():
                known.add(path.resolve())
                if a.trashed:
                    notes = [f"deleted {a.trashed_date:%Y-%m-%d}"] if a.trashed_date else []
                    findings.append(Finding("recently_deleted", path, a.filename, label, a.relpath,
                                            a.created_date, notes))
                break
    known_stems = {strip_ext(str(p)) for p in known}
    for root in roots:
        if not root.is_dir():
            continue
        for path in sorted(root.rglob("*")):
            if path.is_file() and is_media(path.name) and strip_ext(str(path.resolve())) not in known_stems:
                findings.append(Finding("not_in_library", path, path.name, label,
                                        str(path.relative_to(library))))
    return findings
