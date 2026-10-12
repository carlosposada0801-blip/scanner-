# Price Glitch Scanner

A small Python bot that watches products at major retailers and pings your phone
the moment a price drops far below normal (a likely pricing error), so you can
buy fast.

- **Sources:** Best Buy Products API (free), Keepa API for Amazon (paid, optional)
- **Alerts:** ntfy.sh push notifications (free, no account), Discord webhook (optional)
- **Storage:** a local SQLite file (`prices.db`) holding price history
- Uses **official APIs only** and stays well under their rate limits

---

## How it works

Every few minutes (default 7) the bot:

1. Asks each retailer's API for the current price of everything on your watchlist.
2. Throws away junk: out of stock, under $10, refurbished/renewed/pre-owned, open-box.
3. Compares the price to the item's **"normal" price**:
   - its own **30-day average** from the database, once it has at least 3 saved prices, or
   - until then, the retailer's own regular price (Best Buy `regularPrice`, Keepa 30-day average).
4. Sends an alert if the price is **≥ 60% below normal**, or **at/below your manual
   `alert_below` price** for that item.
5. Never sends the same product at the same price twice within 24 hours.
6. Saves the price to history and writes everything to `logs/scanner.log`.

```
config.yaml ─► main.py (scheduler) ─► sources/bestbuy.py ─┐
                                   ─► sources/keepa.py  ──┤─► detector.py ─► notifier.py ─► 📱
                                                          └─► db.py (SQLite history + alerts)
```

| File | What it does |
|---|---|
| `config.yaml` | Watchlist, thresholds, schedule, notification settings |
| `.env` | Your API keys and ntfy topic (secret — never commit it) |
| `main.py` | Starts everything; runs the check loop; test mode |
| `sources/` | One module per retailer, all with the same `fetch()` interface |
| `detector.py` | The glitch rules (pure logic, unit tested) |
| `db.py` | SQLite: price history, sent alerts |
| `notifier.py` | ntfy + Discord |
| `http_utils.py` | Retries with exponential backoff, rate limiting |
| `tests/` | Unit tests |

---

## Setup, step by step

### 1. Install Python

You need **Python 3.10 or newer**. Check with:

```bash
python3 --version
```

If you don't have it, download it from <https://www.python.org/downloads/>. On Windows,
tick **"Add Python to PATH"** during install, and use `python` instead of `python3` below.

### 2. Download the project and install dependencies

```bash
git clone https://github.com/carlosposada0801-blip/scanner-.git
cd scanner-

# Create an isolated environment for this project (recommended)
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate

pip install -r requirements.txt
```

### 3. Get a Best Buy API key (free)

1. Go to <https://developer.bestbuy.com> and click **Get API Key**.
2. Sign up with your email and verify it.
3. Your key appears on your account dashboard (it can take a little while to activate).

Limits: 5 requests per second and 50,000 per day. By default the bot makes at most
2 requests per second. With the example watchlist it uses roughly 4 requests per
check, about 800 a day.

### 4. (Optional) Get a Keepa API key for Amazon

Skip this if you only want Best Buy. The bot works fine without it.

1. Create an account at <https://keepa.com>.
2. Open <https://keepa.com/#!api> and subscribe to an API plan (paid, monthly).
3. Copy your access key.

Keepa charges about **1 token per product per lookup**, and your plan refills a fixed
number of tokens per minute. Example: 20 ASINs checked every 7 minutes uses about
4,100 tokens a day. Watch the log for "Keepa tokens running low".

### 5. Set up ntfy on your phone (free)

1. Install the **ntfy** app ([Android](https://play.google.com/store/apps/details?id=io.heckel.ntfy) /
   [iPhone](https://apps.apple.com/app/ntfy/id1625396347)).
2. Make up a **long, random topic name**, e.g. `glitch-alerts-7f3k9q2xv8`.
   ⚠️ ntfy topics are public: anyone who guesses the name can read your alerts,
   so don't use something guessable like `deals`.
3. In the app, tap **+** (Subscribe to topic) and enter that exact name.
4. For the loudest alerts: open the topic's settings in the app and allow it to
   override Do Not Disturb / use an urgent sound. Alerts are sent at max priority.

### 6. Create your `.env` file

Copy the example, then fill it in:

```bash
cp .env.example .env            # Windows: copy .env.example .env
```

Open `.env` in any text editor:

```
BESTBUY_API_KEY=your-best-buy-key
KEEPA_API_KEY=                   # leave blank if you don't have one
NTFY_TOPIC=glitch-alerts-7f3k9q2xv8
DISCORD_WEBHOOK_URL=             # optional
```

### 7. Send yourself a test alert

```bash
python main.py --test
```

This injects a fake product with a $499.99 history that suddenly drops to $79.99
and sends it through the real detection and notification code. Within a few seconds
your phone should buzz with **"PRICE GLITCH -84%: TEST ALERT…"**. It uses a temporary
database, so you can run it as often as you like without affecting your real data.

### 8. Edit your watchlist

Open `config.yaml`. Each watchlist entry needs exactly **one** of:

| Key | Meaning | Example |
|---|---|---|
| `sku` (Best Buy) / `asin` (Amazon) | one specific product | `sku: "1234567"` |
| `keywords` (Best Buy) | a search | `keywords: "oled tv"` |
| `category` (Best Buy) | a whole category | `category: "abcat0101000"` |

Any threshold can be overridden per item:

```yaml
watchlist:
  bestbuy:
    - name: "OLED TVs"
      keywords: "oled tv"
      max_pages: 3          # 100 products per page, so up to 300 TVs
      drop_percent: 50      # be a bit more sensitive for this search
    - name: "Some console"
      sku: "1234567"        # replace with a real SKU
      alert_below: 300      # tell me if it's ever $300 or less
  keepa:
    - name: "Some Amazon item"
      asin: "B0XXXXXXXX"    # replace with a real ASIN
      alert_below: 60
```

**Finding IDs**
- **Best Buy SKU:** the number after `skuId=` in a product page URL, or listed as "SKU" on the page.
- **Best Buy category id:** open <https://bestbuyapis.github.io/bby-query-builder/> (the
  official query builder), pick a category and copy its id (e.g. `abcat0502000` = laptops).
- **Amazon ASIN:** the 10-character code after `/dp/` in an Amazon URL.

### 9. Run it

```bash
python main.py --dry-run --once   # one check, log alerts but don't send them
python main.py --once             # one real check, then exit
python main.py                    # run forever (Ctrl+C to stop)
```

The **first run** only has the retailers' "regular" prices to compare against. From
then on the bot builds its own 30-day history, which is more reliable. Expect a few
genuine clearance deals to trigger early alerts.

### 10. Check what it's doing

Everything is written to `logs/scanner.log` (rotated automatically):

```
INFO    scanner: Checked 187 products from bestbuy
WARNING scanner: ALERT [bestbuy] Some Laptop | $129.99 | 87% below 30-day average ...
INFO    notifier: Sent alert via ntfy: PRICE GLITCH -87%: Some Laptop
```

Set `logging.level: DEBUG` in `config.yaml` to see every product's price on every check.

### Running the tests

```bash
python -m pytest
```

---

## Settings reference (`config.yaml`)

| Setting | Default | Meaning |
|---|---|---|
| `schedule.interval_minutes` | 7 | Minutes between checks |
| `thresholds.drop_percent` | 60 | % below normal that counts as a glitch |
| `thresholds.history_days` | 30 | Window for the average price |
| `thresholds.min_history_samples` | 3 | Saved prices needed before trusting our own average |
| `thresholds.min_price` | 10 | Ignore items cheaper than this |
| `thresholds.ignore_refurbished` | true | Skip refurbished/renewed/pre-owned |
| `thresholds.ignore_open_box` | true | Skip open-box |
| `thresholds.realert_hours` | 24 | Quiet period for the same product + price |
| `storage.record_every_minutes` | 60 | How often an *unchanged* price is saved (changes are always saved) |
| `storage.keep_days` | 90 | Older history is deleted |
| `sources.keepa.price_type` | amazon | `amazon` = sold by Amazon; `new` = lowest new price incl. 3rd-party sellers |

**Errors and rate limits:** temporary errors (timeouts, HTTP 429/5xx) are retried with
exponential backoff (2s, 4s, 8s, 16s) and the bot respects `Retry-After`. If a source
keeps failing, the bot skips it for 1, 2, 4… (up to 16) checks so it doesn't hammer
a struggling API. One retailer failing never stops the others.

---

## Discord (optional)

1. In your Discord server: **Server Settings → Integrations → Webhooks → New Webhook**,
   choose a channel and **Copy Webhook URL**.
2. Paste it into `.env` as `DISCORD_WEBHOOK_URL=...`.
3. In `config.yaml`, set `notifications.discord.enabled: true`.
4. Run `python main.py --test` again. You should get the alert in both places.

---

## Extending it later

The code is set up so these are easy to add:

- **More retailers (Walmart, Target, Newegg):** add `sources/walmart.py` with a class
  subclassing `Source` and implementing `fetch(items)`, then register it in
  `sources/__init__.py`. Use each retailer's official/affiliate API.
- **Web dashboard:** everything is in `prices.db` (`products`, `prices`, `alerts` tables);
  `Database.recent_alerts()` is already there. A small Flask/FastAPI app can read it.
- **24/7 on a Raspberry Pi or cheap VPS:** copy the folder over, then run it as a
  `systemd` service, or use cron with `python main.py --once`.
- **Paid Discord channel:** point `DISCORD_WEBHOOK_URL` at the paid channel's webhook,
  or add another notifier class in `notifier.py`.

## Rules of the road

- Official APIs only. No scraping, no bypassing bot protection.
- Read and follow each API's terms (Best Buy and Keepa both have them). In particular,
  check their terms before **redistributing** their data commercially (for example,
  a paid alert channel).
- A "glitch" price isn't guaranteed: retailers often cancel orders placed at obvious
  pricing errors. Buy accordingly.
