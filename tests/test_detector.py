from detector import evaluate, skip_reason
from models import PriceRecord, Thresholds


def rec(price=100.0, **kw):
    base = dict(source="bestbuy", product_id="123", name="Big TV", price=price,
                url="https://example.com", in_stock=True, condition="New")
    base.update(kw)
    return PriceRecord(**base)


T = Thresholds()  # defaults: 60% drop, $10 min, 3 samples


def test_flags_big_drop_vs_history():
    a = evaluate(rec(150), T, history_avg=500, history_samples=10)
    assert a is not None
    assert round(a.drop_percent) == 70
    assert a.baseline_kind == "30-day average"


def test_exactly_at_threshold_alerts():
    assert evaluate(rec(200), T, history_avg=500, history_samples=10) is not None


def test_small_drop_ignored():
    assert evaluate(rec(400), T, history_avg=500, history_samples=10) is None


def test_custom_threshold():
    t = Thresholds(drop_percent=15)
    assert evaluate(rec(400), t, history_avg=500, history_samples=10) is not None


def test_falls_back_to_reference_price_when_history_thin():
    a = evaluate(rec(100, reference_price=400), T, history_avg=100, history_samples=1)
    assert a is not None
    assert a.baseline == 400
    assert a.baseline_kind == "retailer regular price"


def test_history_preferred_over_reference_price():
    # Retailer claims $1000 "regular" but we've seen it at $300 for a month.
    assert evaluate(rec(250, reference_price=1000), T, history_avg=300, history_samples=20) is None


def test_no_baseline_no_alert():
    assert evaluate(rec(50), T) is None


def test_alert_below_manual_price():
    t = Thresholds(alert_below=299.99)
    a = evaluate(rec(299.99), t)
    assert a is not None
    assert "alert price" in a.reasons[0]
    assert a.drop_percent is None


def test_alert_below_not_triggered_above():
    assert evaluate(rec(300), Thresholds(alert_below=299.99)) is None


def test_both_reasons_reported():
    t = Thresholds(alert_below=200)
    a = evaluate(rec(100), t, history_avg=500, history_samples=5)
    assert len(a.reasons) == 2


def test_cheap_items_ignored():
    assert skip_reason(rec(9.99), T) is not None
    assert evaluate(rec(5, reference_price=100), T) is None


def test_min_price_override():
    assert evaluate(rec(5, reference_price=100), Thresholds(min_price=1)) is not None


def test_out_of_stock_ignored():
    assert evaluate(rec(50, in_stock=False), T, history_avg=500, history_samples=10) is None


def test_refurbished_ignored_by_condition_and_name():
    assert evaluate(rec(50, condition="Refurbished"), T, 500, 10) is None
    assert evaluate(rec(50, name="Laptop (Renewed)"), T, 500, 10) is None
    assert evaluate(rec(50, name="Phone - Pre-Owned"), T, 500, 10) is None


def test_refurbished_allowed_when_configured():
    t = Thresholds(ignore_refurbished=False)
    assert evaluate(rec(50, condition="Refurbished"), t, 500, 10) is not None


def test_open_box_ignored():
    assert evaluate(rec(50, name="TV Open-Box"), T, 500, 10) is None
    assert evaluate(rec(50, name="TV open box"), T, 500, 10) is None
    t = Thresholds(ignore_open_box=False)
    assert evaluate(rec(50, name="TV Open Box"), t, 500, 10) is not None


def test_price_increase_never_alerts():
    assert evaluate(rec(600), T, history_avg=500, history_samples=10) is None
