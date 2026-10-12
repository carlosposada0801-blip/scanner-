import time

from config import Settings
from db import DAY, Database
from main import Scanner
from models import PriceRecord, Thresholds, WatchItem


def make_rec(price, pid="SKU1"):
    return PriceRecord(source="bestbuy", product_id=pid, name="Test TV", price=price,
                       url="https://example.com/tv", in_stock=True)


def make_settings():
    return Settings(raw={}, thresholds=Thresholds(), watchlist=[], interval_minutes=5,
                    jitter_seconds=0, database=":memory:", record_every_minutes=60,
                    keep_days=90, log_file="logs/test.log", log_level="INFO")


class FakeNotifier:
    name = "fake"

    def __init__(self, fail=False):
        self.sent = []
        self.fail = fail

    def send(self, alert):
        if self.fail:
            raise RuntimeError("boom")
        self.sent.append(alert)


def seed(db, price=500.0, days=10, pid="SKU1"):
    now = time.time()
    for d in range(days, 0, -1):
        db.record_price(make_rec(price, pid), now=now - d * DAY + 60)


def test_average_and_window():
    db = Database(":memory:")
    now = time.time()
    db.record_price(make_rec(1000), now=now - 40 * DAY)   # outside 30-day window
    db.record_price(make_rec(400), now=now - 5 * DAY)
    db.record_price(make_rec(600), now=now - 1 * DAY)
    avg, n = db.price_stats("bestbuy", "SKU1", 30, now=now)
    assert n == 2 and avg == 500


def test_unchanged_price_throttled_but_changes_saved():
    db = Database(":memory:")
    now = time.time()
    assert db.record_price(make_rec(100), 60, now=now)
    assert not db.record_price(make_rec(100), 60, now=now + 300)     # same, too soon
    assert db.record_price(make_rec(90), 60, now=now + 600)          # changed
    assert db.record_price(make_rec(90), 60, now=now + 600 + 3600)   # due again


def test_pipeline_alerts_once_then_dedupes():
    db = Database(":memory:")
    seed(db)
    n = FakeNotifier()
    scanner = Scanner(make_settings(), db, {}, [n])
    item = WatchItem("bestbuy", "TVs", "id", "SKU1", Thresholds())

    assert scanner.process(item, make_rec(99.99)) is not None
    assert scanner.process(item, make_rec(99.99)) is None       # same price within 24h
    assert len(n.sent) == 1
    # A different (even lower) price is a new alert.
    assert scanner.process(item, make_rec(49.99)) is not None
    assert len(n.sent) == 2


def test_dedupe_expires_after_window():
    db = Database(":memory:")
    now = time.time()
    from models import Alert
    db.record_alert(Alert(make_rec(99.99), 500, "avg", 80, ["x"]), now=now - 25 * 3600)
    assert not db.alerted_recently("bestbuy", "SKU1", 99.99, 24, now=now)
    assert db.alerted_recently("bestbuy", "SKU1", 99.99, 26, now=now)


def test_failed_notification_is_retried_next_cycle():
    db = Database(":memory:")
    seed(db)
    bad = FakeNotifier(fail=True)
    scanner = Scanner(make_settings(), db, {}, [bad])
    item = WatchItem("bestbuy", "TVs", "id", "SKU1", Thresholds())
    scanner.process(item, make_rec(99.99))
    assert not db.alerted_recently("bestbuy", "SKU1", 99.99, 24)


def test_glitch_does_not_drag_down_its_own_baseline():
    db = Database(":memory:")
    seed(db, days=3)                       # exactly min_history_samples
    n = FakeNotifier()
    scanner = Scanner(make_settings(), db, {}, [n])
    item = WatchItem("bestbuy", "TVs", "id", "SKU1", Thresholds())
    alert = scanner.process(item, make_rec(100))
    assert alert.baseline == 500
