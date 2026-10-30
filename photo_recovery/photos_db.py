"""Reads the Photos library database (Photos.sqlite) used by iOS and macOS."""

from dataclasses import dataclass
from datetime import datetime

from .util import coredata_to_datetime


@dataclass
class PhotoAsset:
    directory: str          # e.g. "DCIM/100APPLE" (iOS) or "3" (Mac originals)
    filename: str           # e.g. "IMG_0001.HEIC"
    trashed: bool           # True = sitting in "Recently Deleted"
    trashed_date: datetime | None
    created_date: datetime | None

    @property
    def relpath(self):
        return f"{self.directory}/{self.filename}" if self.directory else self.filename


def read_assets(conn):
    tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    # iOS 14+/macOS 11+ use ZASSET; older versions call it ZGENERICASSET.
    table = next((t for t in ("ZASSET", "ZGENERICASSET") if t in tables), None)
    if table is None:
        raise ValueError("not a Photos database (no ZASSET table)")
    cols = {r[1] for r in conn.execute(f"PRAGMA table_info({table})")}
    if not {"ZDIRECTORY", "ZFILENAME"} <= cols:
        raise ValueError(f"unexpected Photos database layout ({table} lacks file columns)")

    def col(name):
        return name if name in cols else "NULL"

    rows = conn.execute(
        f"SELECT ZDIRECTORY, ZFILENAME, {col('ZTRASHEDSTATE')} AS trashed, "
        f"{col('ZTRASHEDDATE')} AS trashed_date, {col('ZDATECREATED')} AS created "
        f"FROM {table} WHERE ZFILENAME IS NOT NULL"
    )
    return [
        PhotoAsset(
            directory=(r["ZDIRECTORY"] or "").strip("/"),
            filename=r["ZFILENAME"],
            trashed=bool(r["trashed"]),
            trashed_date=coredata_to_datetime(r["trashed_date"]),
            created_date=coredata_to_datetime(r["created"]),
        )
        for r in rows
    ]
