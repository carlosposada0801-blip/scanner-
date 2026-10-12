"""Best Buy Products API (https://developer.bestbuy.com).

Uses the official API only. Docs: https://bestbuyapis.github.io/api-documentation/
"""
from __future__ import annotations

import logging
import re
from typing import Iterable, Optional
from urllib.parse import quote

import requests

from http_utils import RateLimiter, make_session
from models import PriceRecord, WatchItem
from sources.base import Source, SourceError

log = logging.getLogger(__name__)

API_ROOT = "https://api.bestbuy.com/v1/products"
FIELDS = "sku,name,salePrice,regularPrice,onlineAvailability,url,condition"
PAGE_SIZE = 100          # API maximum
SKU_BATCH = 100


def _clean_keywords(text: str) -> list[str]:
    """Best Buy search terms: letters/digits only, one `search=` per word."""
    return [w for w in re.split(r"[^A-Za-z0-9]+", text) if w]


def _to_float(v) -> Optional[float]:
    try:
        return float(v) if v is not None else None
    except (TypeError, ValueError):
        return None


def parse_product(p: dict) -> Optional[PriceRecord]:
    price = _to_float(p.get("salePrice"))
    if price is None or p.get("sku") is None:
        return None
    sku = str(p["sku"])
    return PriceRecord(
        source="bestbuy",
        product_id=sku,
        name=p.get("name") or f"Best Buy SKU {sku}",
        price=price,
        url=p.get("url") or f"https://www.bestbuy.com/site/{sku}.p?skuId={sku}",
        in_stock=bool(p.get("onlineAvailability", False)),
        condition=p.get("condition") or "New",
        reference_price=_to_float(p.get("regularPrice")),
    )


class BestBuySource(Source):
    name = "bestbuy"
    api_key_env = "BESTBUY_API_KEY"

    def __init__(self, api_key, options=None, session: requests.Session | None = None):
        super().__init__(api_key, options)
        if not api_key:
            raise SourceError("BESTBUY_API_KEY is not set")
        self.session = session or make_session()
        self.limiter = RateLimiter(float(self.options.get("requests_per_second", 2)))

    def _get(self, filter_expr: str, page: int = 1) -> dict:
        url = f"{API_ROOT}({quote(filter_expr, safe='=&(),.')})"
        params = {"apiKey": self.api_key, "format": "json", "show": FIELDS,
                  "pageSize": PAGE_SIZE, "page": page}
        self.limiter.wait()
        try:
            resp = self.session.get(url, params=params, timeout=20)
        except requests.RequestException as e:
            raise SourceError(f"Best Buy request failed: {e}") from e
        if resp.status_code in (401, 403):
            raise SourceError("Best Buy rejected the API key (check BESTBUY_API_KEY)")
        if resp.status_code != 200:
            raise SourceError(f"Best Buy HTTP {resp.status_code}: {resp.text[:200]}")
        return resp.json()

    def _search(self, filter_expr: str, max_pages: int) -> Iterable[PriceRecord]:
        page, total_pages = 1, 1
        while page <= min(total_pages, max_pages):
            data = self._get(filter_expr, page)
            total_pages = int(data.get("totalPages") or 1)
            for p in data.get("products", []):
                rec = parse_product(p)
                if rec:
                    yield rec
            page += 1

    def fetch(self, items: list[WatchItem]) -> Iterable[tuple[WatchItem, PriceRecord]]:
        # Specific SKUs are batched: one request for up to 100 SKUs.
        sku_items = {i.value: i for i in items if i.kind == "id"}
        skus = list(sku_items)
        for start in range(0, len(skus), SKU_BATCH):
            batch = skus[start:start + SKU_BATCH]
            expr = f"sku in({','.join(batch)})"
            for rec in self._search(expr, max_pages=1):
                if rec.product_id in sku_items:
                    yield sku_items[rec.product_id], rec

        for item in items:
            max_pages = int(item.options.get("max_pages", 1))
            if item.kind == "keywords":
                words = _clean_keywords(item.value)
                if not words:
                    log.warning("Best Buy item %r has no usable keywords", item.name)
                    continue
                expr = "&".join(f"search={w}" for w in words) + "&active=true"
            elif item.kind == "category":
                expr = f"categoryPath.id={item.value}&active=true"
            else:
                continue
            for rec in self._search(expr, max_pages):
                yield item, rec
