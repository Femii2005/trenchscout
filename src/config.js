// All settings come from environment variables so you can tweak them on Railway without touching code.
const num = (v, d) => (v === undefined || v === '' ? d : Number(v));

export const config = {
  port: num(process.env.PORT, 3000),
  dbPath: process.env.DB_PATH || './scout.json',

  // Data source: https://twitterapi.io (pay-as-you-go, ~$0.15 per 1,000 tweets)
  twitterApiKey: process.env.TWITTERAPI_KEY || '',
  // TikTok via ScrapeCreators. Scanner stays off until the key is set.
  scrapeCreatorsKey: process.env.SCRAPECREATORS_KEY || '',
  // Minutes between TikTok scans. 120 = ~8 searches x 12/day ≈ 2,900 credits/month (~$5.50).
  tiktokIntervalMin: num(process.env.TIKTOK_INTERVAL_MIN, 120),
  tiktokRegion: process.env.TIKTOK_REGION || 'US',
  // Ignore TikToks below this many likes (search returns lots of small videos)
  tiktokMinLikes: num(process.env.TIKTOK_MIN_LIKES, 20000),

  // Gap between requests. Free tier = 1 request / 5s. If you upgrade, set REQUEST_GAP_MS=500.
  requestGapMs: num(process.env.REQUEST_GAP_MS, 5500),

  // How often to scan X, in minutes. Lower = fresher but costs more.
  scanIntervalMin: num(process.env.SCAN_INTERVAL_MIN, 30),
  // Only look at posts from the last N hours (older = already dead for a launch).
  lookbackHours: num(process.env.LOOKBACK_HOURS, 12),
  // How many top posts to re-check each scan to measure acceleration.
  recheckLimit: num(process.env.RECHECK_LIMIT, 25),
  // Drop posts older than this from the database.
  keepHours: num(process.env.KEEP_HOURS, 72),

  // Telegram
  telegramToken: process.env.TELEGRAM_BOT_TOKEN || '',
  // Extra chat IDs to always alert (comma-separated). Anyone who sends /start to the bot is added automatically.
  telegramChatIds: (process.env.TELEGRAM_CHAT_IDS || '').split(',').map(s => s.trim()).filter(Boolean),
  // Posts at or above this heat score trigger an alert (0-100).
  alertScore: num(process.env.ALERT_SCORE, 70),
  // ...AND meme potential at or above this (0-100). Lower = more alerts, higher = only clear coin narratives.
  memeAlertScore: num(process.env.MEME_ALERT_SCORE, 45),
  // Lock the bot so only these Telegram user IDs can /start it (comma-separated). Empty = anyone.
  telegramAllowedUsers: (process.env.TELEGRAM_ALLOWED_USERS || '').split(',').map(s => s.trim()).filter(Boolean),

  // Optional: Claude writes a 1-line narrative + ticker idea for hot posts.
  anthropicKey: process.env.ANTHROPIC_API_KEY || '',
  anthropicModel: process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5',

  // Optional: password-protect the dashboard (username can be anything).
  dashboardPassword: process.env.DASHBOARD_PASSWORD || '',

  // DEMO=1 fills the dashboard with sample posts so you can see it without an API key.
  demo: process.env.DEMO === '1',
};
