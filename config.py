"""Loads config.yaml + .env into simple Python objects."""
from __future__ import annotations

import os
from dataclasses import dataclass, fields, replace
from pathlib import Path
from typing import Any

import yaml
from dotenv import load_dotenv

from models import Thresholds, WatchItem

# Keys that identify what a watchlist entry tracks -> internal "kind".
ID_KEYS = ("sku", "asin", "id")
THRESHOLD_KEYS = {f.name for f in fields(Thresholds)}


class ConfigError(ValueError):
    pass


@dataclass
class Settings:
    raw: dict
    thresholds: Thresholds
    watchlist: list[WatchItem]
    interval_minutes: float
    jitter_seconds: float
    database: str
    record_every_minutes: float
    keep_days: int
    log_file: str
    log_level: str

    def source_options(self, source: str) -> dict:
        return (self.raw.get("sources") or {}).get(source) or {}

    def notification_options(self, name: str) -> dict:
        return (self.raw.get("notifications") or {}).get(name) or {}


def _thresholds_from(data: dict, base: Thresholds) -> Thresholds:
    overrides = {k: v for k, v in data.items() if k in THRESHOLD_KEYS}
    return replace(base, **overrides)


def _parse_item(source: str, entry: dict, base: Thresholds) -> WatchItem:
    if not isinstance(entry, dict):
        raise ConfigError(f"watchlist.{source}: each item must be a mapping, got {entry!r}")

    targets = [(k, entry[k]) for k in (*ID_KEYS, "keywords", "category") if entry.get(k)]
    if len(targets) != 1:
        raise ConfigError(
            f"watchlist.{source} item {entry.get('name', entry)!r}: "
            "set exactly one of sku/asin, keywords, or category"
        )
    key, value = targets[0]
    kind = "id" if key in ID_KEYS else key

    options = {
        k: v for k, v in entry.items()
        if k not in THRESHOLD_KEYS and k not in (*ID_KEYS, "keywords", "category", "name")
    }
    return WatchItem(
        source=source,
        name=str(entry.get("name") or value),
        kind=kind,
        value=str(value).strip(),
        thresholds=_thresholds_from(entry, base),
        options=options,
    )


def load_settings(path: str | os.PathLike = "config.yaml", env_file: str | None = ".env") -> Settings:
    if env_file:
        load_dotenv(env_file)

    p = Path(path)
    if not p.exists():
        raise ConfigError(f"Config file not found: {p.resolve()}")
    raw: dict[str, Any] = yaml.safe_load(p.read_text()) or {}

    base = _thresholds_from(raw.get("thresholds") or {}, Thresholds())

    watchlist: list[WatchItem] = []
    for source, entries in (raw.get("watchlist") or {}).items():
        for entry in entries or []:
            watchlist.append(_parse_item(source, entry, base))

    schedule = raw.get("schedule") or {}
    storage = raw.get("storage") or {}
    log = raw.get("logging") or {}

    interval = float(schedule.get("interval_minutes", 7))
    if interval < 1:
        raise ConfigError("schedule.interval_minutes must be at least 1")

    return Settings(
        raw=raw,
        thresholds=base,
        watchlist=watchlist,
        interval_minutes=interval,
        jitter_seconds=float(schedule.get("jitter_seconds", 30)),
        database=str(storage.get("database", "prices.db")),
        record_every_minutes=float(storage.get("record_every_minutes", 60)),
        keep_days=int(storage.get("keep_days", 90)),
        log_file=str(log.get("file", "logs/scanner.log")),
        log_level=str(log.get("level", "INFO")).upper(),
    )
