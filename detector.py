"""Glitch detection logic. Pure functions: no network, no database — easy to test."""
from __future__ import annotations

import re
from typing import Optional

from models import Alert, PriceRecord, Thresholds

REFURB_PATTERN = re.compile(
    r"\b(refurb(ished)?|renewed|pre-?owned|used|reconditioned)\b", re.IGNORECASE)
OPEN_BOX_PATTERN = re.compile(r"\bopen[\s-]?box\b", re.IGNORECASE)


def skip_reason(rec: PriceRecord, t: Thresholds) -> Optional[str]:
    """Return why this record should be ignored, or None if it's worth checking."""
    if not rec.in_stock:
        return "out of stock"
    if rec.price <= 0:
        return "no valid price"
    if rec.price < t.min_price:
        return f"under minimum price ${t.min_price:g}"
    text = f"{rec.name} {rec.condition}"
    if t.ignore_refurbished and REFURB_PATTERN.search(text):
        return "refurbished/used"
    if t.ignore_open_box and OPEN_BOX_PATTERN.search(text):
        return "open box"
    return None


def choose_baseline(history_avg: Optional[float], history_samples: int,
                    reference_price: Optional[float], t: Thresholds
                    ) -> tuple[Optional[float], str]:
    """Pick the "normal" price to compare against.

    Our own 30-day average is preferred. Until we've collected enough samples,
    fall back to the retailer's reference price (e.g. Best Buy's regularPrice,
    Keepa's 30-day average)."""
    if history_avg and history_samples >= t.min_history_samples:
        return history_avg, f"{t.history_days}-day average"
    if reference_price and reference_price > 0:
        return reference_price, "retailer regular price"
    return None, "no baseline yet"


def percent_drop(baseline: float, price: float) -> float:
    return (baseline - price) / baseline * 100.0


def evaluate(rec: PriceRecord, t: Thresholds, history_avg: Optional[float] = None,
             history_samples: int = 0, watch_name: str = "") -> Optional[Alert]:
    """Return an Alert if this price looks like a glitch, else None.

    `history_avg` / `history_samples` must describe history *before* this
    observation, so a glitch price doesn't drag down its own baseline."""
    if skip_reason(rec, t):
        return None

    baseline, kind = choose_baseline(history_avg, history_samples, rec.reference_price, t)
    drop = percent_drop(baseline, rec.price) if baseline else None

    reasons = []
    if drop is not None and drop >= t.drop_percent:
        reasons.append(f"{drop:.0f}% below {kind} (threshold {t.drop_percent:g}%)")
    if t.alert_below is not None and rec.price <= t.alert_below:
        reasons.append(f"at or below your alert price ${t.alert_below:,.2f}")

    if not reasons:
        return None
    return Alert(record=rec, baseline=baseline, baseline_kind=kind,
                 drop_percent=drop if (drop is not None and drop > 0) else None,
                 reasons=reasons, watch_name=watch_name)
