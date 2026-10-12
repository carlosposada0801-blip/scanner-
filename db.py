"""SQLite storage: products, price history and sent alerts."""
from __future__ import annotations

import sqlite3
import time
from pathlib import Path
from typing import Optional

from models import Alert, PriceRecord

SCHEMA = """
CREATE TABLE IF NOT EXISTS products (
    source      TEXT NOT NULL,
    product_id  TEXT NOT NULL,
    name        TEXT,
    url         TEXT,
    first_seen  REAL NOT NULL,
    last_seen   REAL NOT NULL,
    last_price  REAL,
    PRIMARY KEY (source, product_id)
);

CREATE TABLE IF NOT EXISTS prices (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    source      TEXT NOT NULL,
    product_id  TEXT NOT NULL,
    price       REAL NOT NULL,
    in_stock    INTEGER NOT NULL DEFAULT 1,
    ts          REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_prices_product_ts ON prices (source, product_id, ts);

CREATE TABLE IF NOT EXISTS alerts (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    source        TEXT NOT NULL,
    product_id    TEXT NOT NULL,
    name          TEXT,
    price         REAL NOT NULL,
    baseline      REAL,
    drop_percent  REAL,
    reasons       TEXT,
    url           TEXT,
    ts            REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_alerts_product_ts ON alerts (source, product_id, ts);
"""

DAY = 86400.0


class Database:
    def __init__(self, path: str = "prices.db"):
        if path != ":memory:":
            Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(path)
        self.conn.row_factory = sqlite3.Row
        self.conn.executescript(SCHEMA)
        self.conn.commit()

    def close(self) -> None:
        self.conn.close()

    # ---- price history -------------------------------------------------

    def price_stats(self, source: str, product_id: str, days: float,
                    now: Optional[float] = None) -> tuple[Optional[float], int]:
        """Average in-stock price over the last `days`, and how many samples it used."""
        now = now or time.time()
        row = self.conn.execute(
            "SELECT AVG(price) AS avg, COUNT(*) AS n FROM prices "
            "WHERE source=? AND product_id=? AND in_stock=1 AND ts>=?",
            (source, product_id, now - days * DAY),
        ).fetchone()
        return (row["avg"], row["n"])

    def record_price(self, rec: PriceRecord, record_every_minutes: float = 60,
                     now: Optional[float] = None) -> bool:
        """Save a price observation. Unchanged prices are saved at most every
        `record_every_minutes`; changes are always saved. Returns True if a row was added."""
        now = now or time.time()
        self.conn.execute(
            "INSERT INTO products (source, product_id, name, url, first_seen, last_seen, last_price) "
            "VALUES (?,?,?,?,?,?,?) "
            "ON CONFLICT(source, product_id) DO UPDATE SET "
            "name=excluded.name, url=excluded.url, last_seen=excluded.last_seen, "
            "last_price=excluded.last_price",
            (rec.source, rec.product_id, rec.name, rec.url, now, now, rec.price),
        )
        last = self.conn.execute(
            "SELECT price, in_stock, ts FROM prices WHERE source=? AND product_id=? "
            "ORDER BY ts DESC LIMIT 1",
            (rec.source, rec.product_id),
        ).fetchone()
        changed = (last is None or abs(last["price"] - rec.price) >= 0.005
                   or bool(last["in_stock"]) != rec.in_stock)
        due = last is None or (now - last["ts"]) >= record_every_minutes * 60
        added = changed or due
        if added:
            self.conn.execute(
                "INSERT INTO prices (source, product_id, price, in_stock, ts) VALUES (?,?,?,?,?)",
                (rec.source, rec.product_id, rec.price, int(rec.in_stock), now),
            )
        self.conn.commit()
        return added

    def prune(self, keep_days: int, now: Optional[float] = None) -> int:
        now = now or time.time()
        cur = self.conn.execute("DELETE FROM prices WHERE ts < ?", (now - keep_days * DAY,))
        self.conn.commit()
        return cur.rowcount

    # ---- alerts --------------------------------------------------------

    def alerted_recently(self, source: str, product_id: str, price: float,
                         hours: float, now: Optional[float] = None) -> bool:
        """True if we already alerted on this product at this same price recently."""
        now = now or time.time()
        row = self.conn.execute(
            "SELECT 1 FROM alerts WHERE source=? AND product_id=? AND ABS(price-?)<0.005 "
            "AND ts>=? LIMIT 1",
            (source, product_id, price, now - hours * 3600),
        ).fetchone()
        return row is not None

    def record_alert(self, alert: Alert, now: Optional[float] = None) -> None:
        r = alert.record
        self.conn.execute(
            "INSERT INTO alerts (source, product_id, name, price, baseline, drop_percent, "
            "reasons, url, ts) VALUES (?,?,?,?,?,?,?,?,?)",
            (r.source, r.product_id, r.name, r.price, alert.baseline, alert.drop_percent,
             "; ".join(alert.reasons), r.url, now or time.time()),
        )
        self.conn.commit()

    def recent_alerts(self, limit: int = 50) -> list[sqlite3.Row]:
        """For a future dashboard."""
        return self.conn.execute(
            "SELECT * FROM alerts ORDER BY ts DESC LIMIT ?", (limit,)
        ).fetchall()
