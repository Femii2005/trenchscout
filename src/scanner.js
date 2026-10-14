import { config } from './config.js';
import { CATEGORIES, buildQuery } from './queries.js';
import { searchTop, lookup } from './twitter.js';
import { scorePost, weighted } from './score.js';
import { categorize, guessSubject, aiRead } from './classify.js';
import { coinCheck } from './dex.js';
import * as store from './db.js';
import { sendAlert } from './telegram.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));
let running = false;

export async function runScan() {
  if (running) return { skipped: true };
  if (!config.twitterApiKey) {
    console.log('[scan] No TWITTERAPI_KEY set — skipping scan.');
    return { skipped: true, reason: 'no api key' };
  }
  running = true;
  const started = Date.now();
  const stats = { fetched: 0, rechecked: 0, newPosts: 0, alerts: 0, errors: [] };

  try {
    // 1) Search every category
    const found = new Map(); // id → {post, cats:Set}
    for (const cat of CATEGORIES) {
      try {
        const posts = await searchTop(buildQuery(cat, config.lookbackHours));
        stats.fetched += posts.length;
        for (const p of posts) {
          const entry = found.get(p.id) || { post: p, cats: new Set() };
          entry.cats.add(cat.id);
          found.set(p.id, entry);
        }
      } catch (e) {
        stats.errors.push(`${cat.id}: ${e.message}`);
      }
    }

    // 2) Re-check the current top posts we didn't just see, to measure acceleration
    const recheckIds = store
      .listPosts({ hours: 24, limit: config.recheckLimit })
      .map(p => p.id)
      .filter(id => !found.has(id));
    for (let i = 0; i < recheckIds.length; i += 20) {
      try {
        const fresh = await lookup(recheckIds.slice(i, i + 20));
        stats.rechecked += fresh.length;
        for (const p of fresh) found.set(p.id, { post: p, cats: new Set() });
      } catch (e) {
        stats.errors.push(`recheck: ${e.message}`);
      }
    }

    // 3) Score, enrich, store, alert
    const now = Date.now();
    for (const { post, cats } of found.values()) {
      const existing = store.rowToPost(store.getPost(post.id));
      if (!existing) stats.newPosts++;

      store.addSnapshot(post.id, now, weighted(post), post.views);
      const s = scorePost(post, store.snapshotsFor(post.id), now);

      const categories = categorize(post.text, [...cats, ...(existing?.categories || [])]);
      let ai = existing?.ai || null;
      if (!ai && s.score >= config.alertScore - 10) ai = await aiRead(post);

      const subject = ai?.subject || existing?.subject || guessSubject(post);
      let coin = existing?.coin || null;
      if (s.score >= 45 && subject) coin = (await coinCheck(subject)) || coin;

      const full = {
        ...post,
        ...s,
        categories,
        subject,
        coin,
        ai,
        firstSeen: existing?.firstSeen || now,
        lastChecked: now,
        alerted: existing?.alerted || false,
      };
      store.upsertPost(full);

      if (!full.alerted && s.score >= config.alertScore) {
        const ok = await sendAlert(full);
        if (ok) {
          store.markAlerted(post.id);
          stats.alerts++;
        }
      }
    }

    store.prune(config.keepHours);
  } finally {
    running = false;
    stats.ms = Date.now() - started;
    store.setMeta('lastScan', Date.now());
    store.setMeta('lastScanStats', JSON.stringify(stats));
    console.log('[scan]', JSON.stringify(stats));
  }
  return stats;
}

export function startScanner() {
  const every = Math.max(5, config.scanIntervalMin) * 60_000;
  setTimeout(runScan, 3000);
  setInterval(runScan, every);
  console.log(`[scan] every ${config.scanIntervalMin} min, lookback ${config.lookbackHours}h`);
}
