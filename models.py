"""Shared data types used across sources, the detector, storage and notifiers."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional


@dataclass
class Thresholds:
    """Detection rules. Global defaults live in config.yaml; items may override."""
    drop_percent: float = 60.0
    history_days: int = 30
    min_history_samples: int = 3
    min_price: float = 10.0
    ignore_refurbished: bool = True
    ignore_open_box: bool = True
    realert_hours: float = 24.0
    alert_below: Optional[float] = None  # manual per-item alert price


@dataclass
class WatchItem:
    """One entry of the watchlist in config.yaml."""
    source: str                 # e.g. "bestbuy", "keepa"
    name: str                   # human label, e.g. "Gaming laptops"
    kind: str                   # "id", "keywords" or "category"
    value: str                  # the SKU/ASIN, search words, or category id
    thresholds: Thresholds
    options: dict = field(default_factory=dict)  # source-specific extras (max_pages, ...)


@dataclass
class PriceRecord:
    """A single price observation returned by a source."""
    source: str
    product_id: str             # SKU / ASIN — unique within a source
    name: str
    price: float
    url: str
    in_stock: bool = True
    condition: str = "new"      # free text from the retailer ("New", "Refurbished", ...)
    reference_price: Optional[float] = None  # retailer's own "normal" price, if known
    currency: str = "USD"


@dataclass
class Alert:
    """A detected glitch, ready to be sent."""
    record: PriceRecord
    baseline: Optional[float]   # the "normal" price we compared against
    baseline_kind: str          # "30-day average", "retailer regular price", ...
    drop_percent: Optional[float]
    reasons: list[str]
    watch_name: str = ""

    @property
    def title(self) -> str:
        if self.drop_percent is not None:
            return f"PRICE GLITCH -{self.drop_percent:.0f}%: {self.record.name}"
        return f"PRICE ALERT: {self.record.name}"

    def body(self) -> str:
        r = self.record
        lines = [r.name, ""]
        if self.baseline is not None:
            lines.append(f"Was: ${self.baseline:,.2f} ({self.baseline_kind})")
        lines.append(f"Now: ${r.price:,.2f}")
        if self.drop_percent is not None:
            lines.append(f"Drop: {self.drop_percent:.1f}%")
        lines.append(f"Store: {r.source}  |  ID: {r.product_id}")
        lines.append("Why: " + "; ".join(self.reasons))
        lines.append("")
        lines.append(r.url)
        return "\n".join(lines)
