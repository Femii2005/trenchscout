import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { CATEGORIES } from './queries.js';
import * as store from './db.js';
import { runScan, startScanner } from './scanner.js';
import { startBot } from './telegram.js';
import { seedDemo } from './demo.js';

// Log errors instead of crashing the whole app
process.on('unhandledRejection', e => console.error('[error]', e?.message || e));
process.on('uncaughtException', e => console.error('[error]', e?.message || e));

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// Optional password lock for the whole site
app.use((req, res, next) => {
  if (!config.dashboardPassword || req.path === '/health') return next();
  const [, b64] = (req.headers.authorization || '').split(' ');
  const pass = b64 ? Buffer.from(b64, 'base64').toString().split(':').slice(1).join(':') : '';
  if (pass === config.dashboardPassword) return next();
  res.set('WWW-Authenticate', 'Basic realm="Trench Scout"').status(401).send('Password required');
});

app.get('/health', (_req, res) => res.send('ok'));

app.get('/api/posts', (req, res) => {
  const q = req.query;
  res.json(
    store.listPosts({
      category: q.category || 'all',
      hours: Number(q.hours) || 24,
      minScore: Number(q.minScore) || 0,
      media: q.media,
      sort: q.sort,
      limit: Math.min(Number(q.limit) || 120, 300),
    }),
  );
});

app.get('/api/status', (_req, res) => {
  const last = Number(store.getMeta('lastScan')) || null;
  res.json({
    lastScan: last,
    nextScan: last ? last + config.scanIntervalMin * 60_000 : null,
    stats: JSON.parse(store.getMeta('lastScanStats') || 'null'),
    intervalMin: config.scanIntervalMin,
    alertScore: config.alertScore,
    hasKey: !!config.twitterApiKey,
    telegram: !!config.telegramToken,
    ai: !!config.anthropicKey,
    demo: config.demo,
    categories: CATEGORIES.map(({ id, label, emoji }) => ({ id, label, emoji })),
  });
});

app.post('/api/scan', async (_req, res) => {
  res.json(await runScan());
});

app.use(express.static(path.join(__dirname, '..', 'public')));

app.listen(config.port, () => {
  console.log(`Trench Scout running on :${config.port}`);
  if (config.demo) seedDemo();
  startScanner();
  const publicUrl = process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : process.env.PUBLIC_URL;
  startBot({ dashboardUrl: publicUrl });
});
