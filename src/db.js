// Storage: plain JSON file. No native modules, nothing to compile, works on any Node 18+.
// Everything lives in memory and is saved to disk a moment after each change.
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

const file = path.resolve(config.dbPath.replace(/\.db$/, '.json'));
fs.mkdirSync(path.dirname(file), { recursive: true });

let data = { posts: {}, snapshots: {}, subscribers: [], meta: {} };
try {
  if (fs.existsSync(file)) data = { ...data, ...JSON.parse(fs.readFileSync(file, 'utf8')) };
  console.log(`[db] ${file} — ${Object.keys(data.posts).length} posts loaded`);
} catch (e) {
  console.error('[db] could not read saved data, starting fresh:', e.message);
}

let timer = null;
let dirty = false;
function flush() {
  if (timer) { clearTimeout(timer); timer = null; }
  if (!dirty) return;
  try {
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data));
    fs.renameSync(tmp, file); // atomic swap so a crash never leaves a half-written file
    dirty = false;
  } catch (e) {
    console.error('[db] save failed:', e.message);
  }
}
function save() {
  dirty = true;
  if (!timer) timer = setTimeout(flush, 500);
}
// Save immediately when the app is stopped (Railway redeploys send SIGTERM)
process.on('exit', flush);
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { flush(); process.exit(0); });

export const getMeta = k => data.meta[k] ?? null;
export const setMeta = (k, v) => { data.meta[k] = String(v); save(); };

export const getPost = id => data.posts[id] || null;
export const rowToPost = p => p || null;

export const snapshotsFor = id => data.snapshots[id] || [];
export function addSnapshot(id, at, weighted, views) {
  const list = (data.snapshots[id] ||= []);
  list.push({ at, weighted, views });
  if (list.length > 12) list.splice(0, list.length - 12);
  save();
}

export function upsertPost(p) {
  const old = data.posts[p.id];
  data.posts[p.id] = old
    ? {
        ...old,
        ...p,
        subject: p.subject ?? old.subject ?? null,
        coin: p.coin ?? old.coin ?? null,
        ai: p.ai ?? old.ai ?? null,
        mediaUrl: p.mediaUrl ?? old.mediaUrl ?? null,
        videoUrl: p.videoUrl ?? old.videoUrl ?? null,
        firstSeen: old.firstSeen ?? p.firstSeen,
        alerted: old.alerted || !!p.alerted,
      }
    : { ...p, alerted: !!p.alerted };
  save();
}

export function markAlerted(id) {
  if (data.posts[id]) { data.posts[id].alerted = true; save(); }
}

export function listPosts({ category, hours = 24, minScore = 0, minMeme = 0, media, platform, sort = 'best', limit = 120 } = {}) {
  const since = Date.now() - hours * 3_600_000;
  let list = Object.values(data.posts).filter(p => p.createdAt >= since && (p.score ?? 0) >= minScore);
  if (minMeme) list = list.filter(p => (p.meme ?? 0) >= minMeme);
  if (platform && platform !== 'all') list = list.filter(p => (p.platform || 'x') === platform);
  if (category && category !== 'all') list = list.filter(p => (p.categories || []).includes(category));
  if (media === 'video') list = list.filter(p => p.mediaType === 'video' || p.mediaType === 'animated_gif');
  if (media === 'photo') list = list.filter(p => p.mediaType === 'photo');
  const keys = { new: 'createdAt', velocity: 'velocity', score: 'score', meme: 'meme', best: 'best' };
  const key = keys[sort] || 'best';
  // older posts (from before meme scoring) fall back to heat score
  const val = p => (key === 'best' ? (p.best ?? p.score) : p[key]) ?? 0;
  list.sort((a, b) => val(b) - val(a));
  return list.slice(0, limit);
}

export function prune(keepHours) {
  const cutoff = Date.now() - keepHours * 3_600_000;
  for (const [id, p] of Object.entries(data.posts)) {
    if (p.createdAt < cutoff) { delete data.posts[id]; delete data.snapshots[id]; }
  }
  save();
}

export function removeWhere(fn) {
  let n = 0;
  for (const [id, p] of Object.entries(data.posts)) {
    if (fn(p)) { delete data.posts[id]; delete data.snapshots[id]; n++; }
  }
  if (n) save();
  return n;
}

export const subscribers = {
  all: () => [...data.subscribers],
  add: id => { id = String(id); if (!data.subscribers.includes(id)) { data.subscribers.push(id); save(); } },
  remove: id => { data.subscribers = data.subscribers.filter(x => x !== String(id)); save(); },
};
