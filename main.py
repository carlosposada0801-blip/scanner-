"""Price Glitch Scanner — entry point.

    python main.py              run forever on the schedule in config.yaml
    python main.py --once       run a single check and exit (handy for cron)
    python main.py --test       send a fake glitch alert to your phone
    python main.py --dry-run    check prices but only log alerts, don't send them
"""
from __future__ import annotations

import argparse
import logging
import os
import random
import sys
import time
from collections import defaultdict
from logging.handlers import RotatingFileHandler
from pathlib import Path

import detector
from config import ConfigError, Settings, load_settings
from db import DAY, Database
from models import Alert, PriceRecord, WatchItem
from notifier import Notifier, build_notifiers, send_all
from sources import SOURCES, Source, SourceError

log = logging.getLogger("scanner")

MAX_COOLDOWN_CYCLES = 16


def setup_logging(log_file: str, level: str) -> None:
    Path(log_file).parent.mkdir(parents=True, exist_ok=True)
    fmt = logging.Formatter("%(asctime)s %(levelname)-7s %(name)s: %(message)s")
    file_handler = RotatingFileHandler(log_file, maxBytes=5_000_000, backupCount=5,
                                       encoding="utf-8")
    file_handler.setFormatter(fmt)
    console = logging.StreamHandler(sys.stdout)
    console.setFormatter(fmt)
    root = logging.getLogger()
    root.handlers[:] = [file_handler, console]
    root.setLevel(getattr(logging, level, logging.INFO))
    logging.getLogger("urllib3").setLevel(logging.WARNING)


class Scanner:
    def __init__(self, settings: Settings, db: Database, sources: dict[str, Source],
                 notifiers: list[Notifier], dry_run: bool = False):
        self.settings = settings
        self.db = db
        self.sources = sources
        self.notifiers = notifiers
        self.dry_run = dry_run
        # Exponential backoff for a failing source: skip it for 1, 2, 4 ... cycles.
        self._failures: dict[str, int] = defaultdict(int)
        self._skip_cycles: dict[str, int] = defaultdict(int)

    # ---- one product ---------------------------------------------------

    def process(self, item: WatchItem, rec: PriceRecord) -> Alert | None:
        t = item.thresholds
        # Baseline is computed from history BEFORE saving this price, so a
        # glitch price can't drag down its own average.
        avg, n = self.db.price_stats(rec.source, rec.product_id, t.history_days)
        alert = detector.evaluate(rec, t, avg, n, watch_name=item.name)

        skip = detector.skip_reason(rec, t)
        log.debug("[%s] %s %s $%.2f%s", rec.source, rec.product_id, rec.name[:60],
                  rec.price, f" (skipped: {skip})" if skip else "")

        self.db.record_price(rec, self.settings.record_every_minutes)

        if not alert:
            return None
        if self.db.alerted_recently(rec.source, rec.product_id, rec.price, t.realert_hours):
            log.info("Already alerted on %s at $%.2f within %gh — not re-sending",
                     rec.product_id, rec.price, t.realert_hours)
            return None

        log.warning("ALERT [%s] %s | $%.2f | %s | %s", rec.source, rec.name, rec.price,
                    "; ".join(alert.reasons), rec.url)
        if self.dry_run:
            self.db.record_alert(alert)
            return alert

        sent = send_all(self.notifiers, alert) if self.notifiers else 0
        # Only mark as alerted if it actually reached you (or there's nowhere to send),
        # so a temporary notification outage gets retried next cycle.
        if sent or not self.notifiers:
            self.db.record_alert(alert)
        return alert

    # ---- one full check ------------------------------------------------

    def run_cycle(self) -> list[Alert]:
        started = time.time()
        alerts: list[Alert] = []
        by_source: dict[str, list[WatchItem]] = defaultdict(list)
        for item in self.settings.watchlist:
            by_source[item.source].append(item)

        for source_name, items in by_source.items():
            source = self.sources.get(source_name)
            if source is None:
                continue
            if self._skip_cycles[source_name] > 0:
                self._skip_cycles[source_name] -= 1
                log.info("Skipping %s this cycle (backing off after errors)", source_name)
                continue

            seen: set[str] = set()
            count = 0
            try:
                for item, rec in source.fetch(items):
                    if rec.product_id in seen:
                        continue   # same product matched by two watch entries
                    seen.add(rec.product_id)
                    count += 1
                    alert = self.process(item, rec)
                    if alert:
                        alerts.append(alert)
                self._failures[source_name] = 0
                log.info("Checked %d products from %s", count, source_name)
            except SourceError as e:
                self._back_off(source_name, e, count)
            except Exception as e:  # noqa: BLE001 — never let one source kill the bot
                log.exception("Unexpected error in %s", source_name)
                self._back_off(source_name, e, count)

        removed = self.db.prune(self.settings.keep_days)
        if removed:
            log.info("Pruned %d old price rows", removed)
        log.info("Check finished in %.1fs — %d alert(s)", time.time() - started, len(alerts))
        return alerts

    def _back_off(self, source_name: str, err: Exception, count: int) -> None:
        self._failures[source_name] += 1
        skip = min(2 ** (self._failures[source_name] - 1), MAX_COOLDOWN_CYCLES)
        self._skip_cycles[source_name] = skip
        log.error("%s failed after %d products: %s — skipping it for %d cycle(s)",
                  source_name, count, err, skip)

    def run_forever(self) -> None:
        log.info("Scanner started: %d watch items, every %g min",
                 len(self.settings.watchlist), self.settings.interval_minutes)
        while True:
            self.run_cycle()
            sleep_for = (self.settings.interval_minutes * 60
                         + random.uniform(0, self.settings.jitter_seconds))
            log.info("Next check in %.0f seconds", sleep_for)
            time.sleep(sleep_for)


def build_sources(settings: Settings) -> dict[str, Source]:
    """Create a source for each retailer in the watchlist that has an API key."""
    wanted = {item.source for item in settings.watchlist}
    sources: dict[str, Source] = {}
    for name in sorted(wanted):
        cls = SOURCES.get(name)
        if cls is None:
            log.error("Unknown source %r in watchlist (known: %s)", name, ", ".join(SOURCES))
            continue
        key = os.getenv(cls.api_key_env, "").strip() if cls.api_key_env else None
        if cls.api_key_env and not key:
            log.warning("%s is not set in .env — %s items will be skipped",
                        cls.api_key_env, name)
            continue
        try:
            sources[name] = cls(key, settings.source_options(name))
        except SourceError as e:
            log.error("Could not start %s: %s", name, e)
    return sources


def run_test_alert(settings: Settings, notifiers: list[Notifier]) -> int:
    """Inject a fake price drop and run it through the real pipeline.

    Uses a throwaway in-memory database, so your real price history is untouched
    and you can run this as many times as you like."""
    if not notifiers:
        log.error("No notifiers configured. Set NTFY_TOPIC (and/or DISCORD_WEBHOOK_URL) "
                  "in .env, then try again.")
        return 1

    db = Database(":memory:")
    fake = PriceRecord(source="test", product_id="TEST-0001",
                       name='TEST ALERT — 65" 4K TV (fake price glitch)',
                       price=499.99, url="https://ntfy.sh", in_stock=True)
    now = time.time()
    for day in range(30, 0, -1):       # 30 days of "normal" history at $499.99
        db.record_price(fake, now=now - day * DAY)
    fake.price = 79.99                 # ...then an 84% drop

    item = WatchItem(source="test", name="Test mode", kind="id", value=fake.product_id,
                     thresholds=settings.thresholds)
    scanner = Scanner(settings, db, sources={}, notifiers=notifiers)
    alert = scanner.process(item, fake)
    if alert and db.recent_alerts(1):
        log.info("Test alert sent. Check your phone!")
        return 0
    log.error("Test alert was NOT delivered — see errors above.")
    return 1


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Price glitch alert bot")
    parser.add_argument("--config", default="config.yaml", help="path to config file")
    parser.add_argument("--once", action="store_true", help="run one check and exit")
    parser.add_argument("--test", action="store_true",
                        help="send a fake glitch alert to confirm notifications work")
    parser.add_argument("--dry-run", action="store_true",
                        help="detect and log alerts but don't send notifications")
    args = parser.parse_args(argv)

    try:
        settings = load_settings(args.config)
    except ConfigError as e:
        print(f"Config error: {e}", file=sys.stderr)
        return 2

    setup_logging(settings.log_file, settings.log_level)
    notifiers = build_notifiers(settings)

    if args.test:
        return run_test_alert(settings, notifiers)

    sources = build_sources(settings)
    if not sources:
        log.error("No sources available. Add BESTBUY_API_KEY (and optionally KEEPA_API_KEY) "
                  "to .env and make sure config.yaml has watchlist entries.")
        return 1
    if not notifiers and not args.dry_run:
        log.warning("No notifiers configured — alerts will only be written to the log.")

    db = Database(settings.database)
    scanner = Scanner(settings, db, sources, notifiers, dry_run=args.dry_run)
    try:
        if args.once:
            scanner.run_cycle()
        else:
            scanner.run_forever()
    except KeyboardInterrupt:
        log.info("Stopped by user.")
    finally:
        db.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
