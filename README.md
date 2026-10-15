# Trench Scout

Finds what's going viral on X **right now**, ranks it by speed (not total views), tags it (cute animals, rescue, funny, nature, weird, wholesome, memes), checks DexScreener for whether a coin already exists on it, and pings you on Telegram when something blows up.

---

## What you need (≈10 min)

| Thing | Where | Cost |
|---|---|---|
| **twitterapi.io key** | twitterapi.io → sign up → copy API key | Pay as you go, ~$0.15 per 1,000 tweets |
| **Telegram bot token** | Telegram → message **@BotFather** → `/newbot` → copy token | Free |
| **Railway account** | railway.com | ~$5/month Hobby plan |
| **GitHub account** | github.com | Free |
| *(optional)* Anthropic API key | console.anthropic.com | A few cents/day. Adds a 1-line narrative + ticker idea on hot posts |

### What the X data will cost you
Default settings: 8 searches every 30 min → about **7,000–9,000 tweets/day ≈ $1.10–1.40/day (~$35–40/month)**.

To go cheaper, set `SCAN_INTERVAL_MIN=60` (≈ $18–20/month). Faster alerts: `SCAN_INTERVAL_MIN=15` (≈ $70/month).

---

## Deploy on Railway

1. **Railway → New Project → Deploy from GitHub repo** → pick the repo. It builds with the included `Dockerfile` (Node 22). Nothing to compile.
2. **Add a volume** so your data survives restarts: click the service → **Settings → Volumes → Add Volume**, mount path `/data`.
3. **Variables tab → Raw Editor** → paste:

   ```
   TWITTERAPI_KEY=your_twitterapi_io_key
   TELEGRAM_BOT_TOKEN=your_botfather_token
   DB_PATH=/data/scout.json
   DASHBOARD_PASSWORD=pick-a-password
   ```
   Optional: `ANTHROPIC_API_KEY=sk-ant-...` and `TELEGRAM_ALLOWED_USERS=your_telegram_user_id`
4. **Settings → Networking → Generate Domain** → that's your dashboard. Log in with any username + your `DASHBOARD_PASSWORD`.
5. **Message your bot `/start`** in Telegram. `/top` shows the current top 5, `/stop` pauses alerts.

A healthy boot log looks like:
```
[db] /data/scout.json — 0 posts loaded
Trench Scout running on :8080
[scan] every 30 min, lookback 12h
[tg] bot polling started
[scan] {"fetched":...,"newPosts":...,"alerts":...,"errors":[]}
```

## TikTok (optional)

TikTok uses [ScrapeCreators](https://scrapecreators.com) (1 credit per call, $47 = 25,000 credits, never expire, 100 free to start).

1. Sign up, copy your API key.
2. Railway → Variables → add `SCRAPECREATORS_KEY=your_key`.

Every 2 hours it pulls **TikTok's trending feed** (`/v1/tiktok/get-trending-feed`): what TikTok itself is pushing right now. It makes 6 pulls across US, GB, CA and AU (6 credits per scan, about $4/month), keeps videos with 20K+ likes from the last 2 days, and runs them through the same heat and meme scoring. Trending videos get a small heat bonus.

Want more coin-specific TikToks too? Set `TIKTOK_SEARCHES=1` to also run the keyword searches in `src/queries.js` (8 more credits per scan).
When the same name (e.g. "Moo Deng") is blowing up on TikTok **and** X, it gets a 🌐 cross-platform boost.

## All settings

| Variable | Default | What it does |
|---|---|---|
| `SCAN_INTERVAL_MIN` | 30 | Minutes between X scans (min 5) |
| `TIKTOK_INTERVAL_MIN` | 120 | Minutes between TikTok scans (min 30) |
| `TIKTOK_TRENDING_REGIONS` | US,US,US,GB,CA,AU | One trending-feed pull per entry |
| `TIKTOK_SEARCHES` | off | `1` = also run coin-tuned keyword searches |
| `TIKTOK_MAX_AGE_HOURS` | 48 | Ignore older TikToks |
| `TIKTOK_REGION` | US | Region for keyword searches |
| `TIKTOK_MIN_LIKES` | 20000 | Ignore TikToks with fewer likes |
| `REQUEST_GAP_MS` | 5500 | Wait between twitterapi.io calls. Free tier needs 5000+; paid can use 500 |
| `LOOKBACK_HOURS` | 12 | Only posts younger than this |
| `ALERT_SCORE` | 70 | Heat score (0–100) needed for a Telegram alert |
| `MEME_ALERT_SCORE` | 45 | Meme potential (0–100) also needed for an alert |
| `BIG_ACCOUNTS` | elonmusk,MrBeast,SnoopDogg,cb_doge,DogeDesigner | Accounts watched in the ⭐ Big accounts category |
| `RECHECK_LIMIT` | 25 | Top posts re-checked each scan to detect "heating up" |
| `KEEP_HOURS` | 72 | Older posts get deleted |
| `TELEGRAM_CHAT_IDS` | – | Extra chats/groups that always get alerts (comma-separated) |
| `ANTHROPIC_MODEL` | claude-haiku-5-5 | Model for the narrative/ticker line |
| `DEMO` | – | `1` = fake sample posts, no API key needed |

---

## Meme potential (🪙 0–100)

Every post also gets a **meme potential** score for how likely it is to become a coin:
- **+** a character with a name ("her name is Moo Deng", "meet Pnut"); the name becomes the suggested ticker
- **+** an animal, especially zoo/baby/rescue animals with personality
- **+** a catchphrase everyone's repeating (quoted phrases become the ticker)
- **+** posted by a big account (Elon etc.)
- **−** already crypto shilling ($TICKER, CA:, presale…), grim news, long news threads

With `ANTHROPIC_API_KEY` set, Claude also rates coinability and that rating counts for 60%.

**Alerts fire only when heat ≥ `ALERT_SCORE` AND meme ≥ `MEME_ALERT_SCORE`.** The dashboard's default **Best** sort blends both.

## How the heat score works

- **Velocity**: engagements per hour since posting. Reposts and quotes count more than likes because they spread the post.
- **Views per hour** adds a boost.
- **Freshness**: under 2h old gets +10, under 6h gets +5.
- **Acceleration**: each scan re-checks the top posts. If it's gaining faster now than its average, it gets **⚡ heating up** (+10). If it's stalling, it gets −10.

Tiers: 🔥🔥🔥 **mega** 80+ · 🔥🔥 **hot** 65+ · 🔥 **warm** 45+

**Coin check** guesses the post's subject (e.g. "capybara") and searches DexScreener for coins on that name launched in the last 7 days:
- 🟢 **No coin yet** = you're early
- 🟡 **X coins already** = shows the top one's chain, mcap and age

---

## Tuning what it finds

Everything lives in `src/queries.js`. Each category is one X search. Add words, raise or lower `min_faves`, or add a new category (copy a block, give it a new `id`). Every extra category adds roughly 1,000 tweets/day to the bill at the default interval.

## Run it on your laptop

```
npm install
npm run demo          # sample data at http://localhost:3000 (Node 18+)
TWITTERAPI_KEY=... npm start   # live
```
