import { config } from './config.js';
import { CATEGORIES, TIKTOK_SEARCHES, buildQuery } from './queries.js';
import { searchTop, lookup } from './twitter.js';
import { tiktokSearch } from './tiktok.js';
import { scorePost, weighted } from './score.js';
import { categorize, guessSubject, aiRead } from './classify.js';
import { coinCheck } from './dex.js';
import { memePotential, bestScore } from './meme.js';
import * as store from './db.js';
import { sendAlert } from './telegram.js';

const running = { x: false, tiktok: false };
const key = s => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Where else the same coin name is showing up in the last 24h
function nameSeen(post, name) {
  const k = key(name);
  if (!k || k.length < 3) return { cross: [], known: false };
  const others = new Set();
  let known = false;
  for (const p of store.listPosts({ hours: 24, sort: 'new', limit: 1e9 })) {
    if (p.id === post.id || key(p.memeName) !== k) continue;
    known = true;
    const plat = p.platform || 'x';
    if (plat !== (post.platform || 'x')) others.add(plat);
  }
  return { cross: [...others], known };
}

function alreadyAlerted(post) {
  const k = key(post.memeName);
  return store.listPosts({ hours: 24, platform: post.platform, sort: 'new', limit: 1e9 })
    .some(p => p.id !== post.id && p.alerted && key(p.memeName) === k);
}

// Shared pipeline for every platform: score → meme potential → coin check → store → alert
async function processPosts(found, stats) {
  const now = Date.now();
  for (const { post, cats } of found.values()) {
    const existing = store.rowToPost(store.getPost(post.id));
    if (!existing) stats.newPosts++;

    store.addSnapshot(post.id, now, weighted(post), post.views);
    const s = scorePost(post, store.snapshotsFor(post.id), now);

    const categories = categorize(post.text, [...cats, ...(existing?.categories || [])]);
    let ai = existing?.ai || null;
    let m = memePotential(post, categories, ai);
    let seen = nameSeen(post, m.name);
    if (seen.known) m = memePotential(post, categories, ai, seen.cross, true);
    let cross = seen.cross;

    // Ask Claude (optional) about posts that are hot or look coin-able
    if (!ai && (s.score >= config.alertScore - 10 || (s.score >= 45 && m.meme >= config.memeAlertScore))) {
      ai = await aiRead(post);
      if (ai) {
        seen = nameSeen(post, ai.name || m.name);
        cross = seen.cross;
        m = memePotential(post, categories, ai, cross, seen.known);
      }
    }

    // The coin check searches the character's name first ("Moo Deng"), then the subject ("hippo")
    const subject = m.name || ai?.subject || existing?.subject || guessSubject(post);
    let coin = existing?.coin || null;
    if (s.score >= 45 && m.meme >= 35 && subject && (!coin || coin.term !== subject || now - (existing?.lastChecked || 0) > 20 * 60_000)) {
      coin = (await coinCheck(subject)) || coin;
    }

    const full = {
      ...post,
      platform: post.platform || 'x',
      ...s,
      meme: m.meme,
      memeName: m.name,
      ticker: m.ticker,
      memeReasons: m.reasons,
      cross,
      best: bestScore(s.score, m.meme),
      categories,
      subject,
      coin,
      ai,
      firstSeen: existing?.firstSeen || now,
      lastChecked: now,
      alerted: existing?.alerted || false,
    };
    store.upsertPost(full);

    // Alert only when it's BOTH blowing up AND looks like coin material
    if (!full.alerted && s.score >= config.alertScore && m.meme >= config.memeAlertScore) {
      // One alert per name per platform (no spam from 10 Moo Deng videos); a NEW platform still pings you
      if (m.name && alreadyAlerted(full)) {
        store.markAlerted(post.id);
        continue;
      }
      if (await sendAlert(full)) {
        store.markAlerted(post.id);
        stats.alerts++;
      }
    }
  }
}

function addFound(found, posts, catId) {
  for (const p of posts) {
    const entry = found.get(p.id) || { post: p, cats: new Set() };
    if (catId) entry.cats.add(catId);
    found.set(p.id, entry);
  }
}

async function guarded(platform, metaKey, fn) {
  if (running[platform]) return { skipped: true };
  running[platform] = true;
  const started = Date.now();
  const stats = { platform, fetched: 0, rechecked: 0, newPosts: 0, alerts: 0, errors: [] };
  try {
    await fn(stats);
    store.prune(config.keepHours);
  } finally {
    running[platform] = false;
    stats.ms = Date.now() - started;
    store.setMeta(metaKey, Date.now());
    store.setMeta(`${metaKey}Stats`, JSON.stringify(stats));
    console.log(`[scan:${platform}]`, JSON.stringify(stats));
  }
  return stats;
}

// ── X ────────────────────────────────────────────────────────────────
export async function runScan() {
  if (!config.twitterApiKey) {
    console.log('[scan:x] No TWITTERAPI_KEY set — skipping.');
    return { skipped: true, reason: 'no api key' };
  }
  return guarded('x', 'lastScan', async stats => {
    const found = new Map();
    for (const cat of CATEGORIES) {
      try {
        const posts = await searchTop(buildQuery(cat, config.lookbackHours));
        stats.fetched += posts.length;
        addFound(found, posts, cat.id);
      } catch (e) {
        stats.errors.push(`${cat.id}: ${e.message}`);
      }
    }

    // Re-check current top X posts we didn't just see, to measure acceleration
    const recheckIds = store
      .listPosts({ hours: 24, platform: 'x', sort: 'score', limit: config.recheckLimit })
      .map(p => p.id)
      .filter(id => !found.has(id));
    for (let i = 0; i < recheckIds.length; i += 20) {
      try {
        const fresh = await lookup(recheckIds.slice(i, i + 20));
        stats.rechecked += fresh.length;
        addFound(found, fresh, null);
      } catch (e) {
        stats.errors.push(`recheck: ${e.message}`);
      }
    }
    await processPosts(found, stats);
  });
}

// ── TikTok ───────────────────────────────────────────────────────────
export async function runTikTok() {
  if (!config.scrapeCreatorsKey) return { skipped: true, reason: 'no SCRAPECREATORS_KEY' };
  return guarded('tiktok', 'lastTikTok', async stats => {
    const found = new Map();
    const cutoff = Date.now() - config.lookbackHours * 3_600_000 * 2; // TikTok trends run a bit longer
    for (const { q, cat } of TIKTOK_SEARCHES) {
      try {
        const posts = (await tiktokSearch(q)).filter(p => p.createdAt >= cutoff && p.likes >= config.tiktokMinLikes);
        stats.fetched += posts.length;
        addFound(found, posts, cat);
      } catch (e) {
        stats.errors.push(`tiktok "${q}": ${e.message}`);
      }
    }
    await processPosts(found, stats);
  });
}

// Re-score every saved post with the current meme rules (so old posts and rule tweaks apply right away)
export function rescoreAll() {
  const dropped = store.removeWhere(p => p.platform === 'tiktok' && (p.likes ?? 0) < config.tiktokMinLikes);
  if (dropped) console.log(`[scan] removed ${dropped} small TikToks (< ${config.tiktokMinLikes} likes)`);
  const posts = store.listPosts({ hours: 1e6, sort: 'new', limit: 1e9 });
  for (const p of posts) {
    const m = memePotential(p, p.categories || [], p.ai, p.cross || [], nameSeen(p, p.memeName).known);
    store.upsertPost({ ...p, platform: p.platform || 'x', meme: m.meme, memeName: m.name, ticker: m.ticker, memeReasons: m.reasons, best: bestScore(p.score ?? 0, m.meme) });
  }
  if (posts.length) console.log(`[scan] re-scored ${posts.length} saved posts`);
}

export function startScanner() {
  rescoreAll();
  const every = Math.max(5, config.scanIntervalMin) * 60_000;
  setTimeout(runScan, 3000);
  setInterval(runScan, every);
  console.log(`[scan:x] every ${config.scanIntervalMin} min, lookback ${config.lookbackHours}h`);

  if (config.scrapeCreatorsKey) {
    const ttEvery = Math.max(30, config.tiktokIntervalMin) * 60_000;
    // Don't burn credits on every redeploy: only scan at boot if the last TikTok scan is older than the interval
    const last = Number(store.getMeta('lastTikTok')) || 0;
    const firstIn = Math.max(90_000, last + ttEvery - Date.now());
    setTimeout(() => { runTikTok(); setInterval(runTikTok, ttEvery); }, firstIn);
    console.log(`[scan:tiktok] every ${config.tiktokIntervalMin} min, next in ${Math.round(firstIn / 60000)} min`);
  } else {
    console.log('[scan:tiktok] off — add SCRAPECREATORS_KEY to turn it on');
  }
}
