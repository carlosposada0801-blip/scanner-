from sources.bestbuy import _clean_keywords, parse_product as bb_parse
from sources.keepa import parse_product as kp_parse


def test_bestbuy_parse():
    r = bb_parse({"sku": 6505727, "name": "TV", "salePrice": 199.99, "regularPrice": 799.99,
                  "onlineAvailability": True, "url": "https://bestbuy.com/x",
                  "condition": "New"})
    assert r.product_id == "6505727"
    assert r.price == 199.99 and r.reference_price == 799.99 and r.in_stock


def test_bestbuy_parse_missing_price():
    assert bb_parse({"sku": 1, "name": "x"}) is None


def test_bestbuy_keywords_sanitised():
    assert _clean_keywords("gaming  laptop & (rtx)") == ["gaming", "laptop", "rtx"]


def test_keepa_parse_amazon_price():
    r = kp_parse({"asin": "B000000001", "title": "Thing",
                  "stats": {"current": [4999, 4500], "avg30": [12999, 12000]}})
    assert r.price == 49.99 and r.reference_price == 129.99 and r.in_stock
    assert r.url == "https://www.amazon.com/dp/B000000001"


def test_keepa_falls_back_to_new_when_amazon_out():
    r = kp_parse({"asin": "B000000001", "stats": {"current": [-1, 4500], "avg30": [-1, 9000]}})
    assert r.price == 45.0 and r.reference_price == 90.0


def test_keepa_no_offers_is_out_of_stock():
    r = kp_parse({"asin": "B000000001", "stats": {"current": [-1, -1]}})
    assert not r.in_stock
