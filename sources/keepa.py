"""Keepa API for Amazon prices (https://keepa.com/#!api). Optional — paid key.

Keepa uses a token bucket: each product looked up costs ~1 token and your plan
refills N tokens per minute. Docs: https://keepa.com/#!discuss/t/product-object/116
"""
from __future__ import annotations

import logging
import re
from typing import Iterable, Optional

import requests

from http_utils import RateLimiter, make_session
from models import PriceRecord, WatchItem
from sources.base import Source, SourceError

log = logging.getLogger(__name__)

API_URL = "https://api.keepa.com/product"
ASIN_BATCH = 100
PRICE_INDEX = {"amazon": 0, "new": 1}   # Keepa csv/stats "price type" indexes
AMAZON_HOSTS = {1: "amazon.com", 2: "amazon.co.uk", 3: "amazon.de", 4: "amazon.fr",
                5: "amazon.co.jp", 6: "amazon.ca", 8: "amazon.it", 9: "amazon.es",
                10: "amazon.in", 11: "amazon.com.mx"}
ASIN_RE = re.compile(r"^[A-Z0-9]{10}$")


def _cents(arr, idx: int) -> Optional[float]:
    """Keepa stores prices as integer cents; -1/-2 mean "no offer"/"no data"."""
    try:
        v = arr[idx]
    except (TypeError, IndexError):
        return None
    if v is None or v < 0:
        return None
    return v / 100.0


def parse_product(p: dict, price_type: str = "amazon", domain: int = 1) -> Optional[PriceRecord]:
    asin = p.get("asin")
    if not asin:
        return None
    stats = p.get("stats") or {}
    current, avg30 = stats.get("current"), stats.get("avg30")

    order = [PRICE_INDEX[price_type]]
    if price_type == "amazon":
        order.append(PRICE_INDEX["new"])   # fall back to 3rd-party new price
    price = ref = None
    for idx in order:
        price = _cents(current, idx)
        if price is not None:
            ref = _cents(avg30, idx)
            break

    host = AMAZON_HOSTS.get(domain, "amazon.com")
    return PriceRecord(
        source="keepa",
        product_id=asin,
        name=p.get("title") or f"Amazon {asin}",
        price=price or 0.0,
        url=f"https://www.{host}/dp/{asin}",
        in_stock=price is not None,
        condition="New",
        reference_price=ref,
    )


class KeepaSource(Source):
    name = "keepa"
    api_key_env = "KEEPA_API_KEY"

    def __init__(self, api_key, options=None, session: requests.Session | None = None):
        super().__init__(api_key, options)
        if not api_key:
            raise SourceError("KEEPA_API_KEY is not set")
        self.session = session or make_session()
        self.domain = int(self.options.get("domain", 1))
        self.price_type = str(self.options.get("price_type", "amazon")).lower()
        if self.price_type not in PRICE_INDEX:
            raise SourceError("sources.keepa.price_type must be 'amazon' or 'new'")
        self.limiter = RateLimiter(float(self.options.get("requests_per_second", 1)))

    def fetch(self, items: list[WatchItem]) -> Iterable[tuple[WatchItem, PriceRecord]]:
        by_asin: dict[str, WatchItem] = {}
        for item in items:
            if item.kind != "id":
                log.warning("Keepa item %r: only 'asin' entries are supported in v1", item.name)
                continue
            asin = item.value.upper()
            if not ASIN_RE.match(asin):
                log.warning("Keepa item %r: %r doesn't look like an ASIN", item.name, item.value)
                continue
            by_asin[asin] = item

        asins = list(by_asin)
        for start in range(0, len(asins), ASIN_BATCH):
            batch = asins[start:start + ASIN_BATCH]
            params = {"key": self.api_key, "domain": self.domain,
                      "asin": ",".join(batch), "stats": 30, "history": 0}
            self.limiter.wait()
            try:
                resp = self.session.get(API_URL, params=params, timeout=30)
            except requests.RequestException as e:
                raise SourceError(f"Keepa request failed: {e}") from e
            if resp.status_code in (401, 402, 403):
                raise SourceError(f"Keepa rejected the request (HTTP {resp.status_code}) — "
                                  "check KEEPA_API_KEY and your subscription")
            if resp.status_code == 429:
                raise SourceError("Keepa: out of tokens — reduce ASINs or check less often")
            if resp.status_code != 200:
                raise SourceError(f"Keepa HTTP {resp.status_code}: {resp.text[:200]}")
            data = resp.json()
            if "tokensLeft" in data:
                log.debug("Keepa tokens left: %s", data["tokensLeft"])
                if data["tokensLeft"] < len(asins):
                    log.warning("Keepa tokens running low (%s left)", data["tokensLeft"])
            for p in data.get("products") or []:
                rec = parse_product(p, self.price_type, self.domain)
                if rec and rec.product_id in by_asin:
                    yield by_asin[rec.product_id], rec
