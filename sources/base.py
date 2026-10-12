"""The interface every retailer module implements.

To add a new retailer (Walmart, Target, Newegg, ...):
  1. Create sources/<name>.py with a class that subclasses Source.
  2. Implement `fetch(items)` returning (WatchItem, PriceRecord) pairs.
  3. Register it in sources/__init__.py (SOURCES dict).
  4. Add a `watchlist: <name>:` section to config.yaml.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Iterable

from models import PriceRecord, WatchItem


class SourceError(RuntimeError):
    pass


class Source(ABC):
    #: key used in config.yaml under `watchlist:` and `sources:`
    name: str = ""
    #: env var holding the API key (None if no key is needed)
    api_key_env: str | None = None

    def __init__(self, api_key: str | None, options: dict | None = None):
        self.api_key = api_key
        self.options = options or {}

    @abstractmethod
    def fetch(self, items: list[WatchItem]) -> Iterable[tuple[WatchItem, PriceRecord]]:
        """Look up current prices for the given watchlist items.

        Sources may batch requests however suits their API. Raise SourceError
        on unrecoverable problems (bad key, API down after retries)."""
