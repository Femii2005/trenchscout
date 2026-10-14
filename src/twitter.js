import { config } from './config.js';

const BASE = 'https://api.twitterapi.io';

const sleep = ms => new Promise(r => setTimeout(r, ms));

// twitterapi.io free tier allows 1 request every 5 seconds. Every request waits its turn here,
// so searches and re-checks never collide. Paid accounts can lower REQUEST_GAP_MS.
let queue = Promise.resolve();
let lastAt = 0;
function throttled(fn) {
  const run = queue.then(async () => {
    const wait = lastAt + config.requestGapMs - Date.now();
    if (wait > 0) await sleep(wait);
    try { return await fn(); } finally { lastAt = Date.now(); }
  });
  queue = run.catch(() => {});
  return run;
}

async function call(path, params, attempt = 1) {
  const url = `${BASE}${path}?${new URLSearchParams(params)}`;
  const res = await throttled(() => fetch(url, { headers: { 'X-API-Key': config.twitterApiKey } }));
  if (res.status === 429 && attempt <= 2) {
    await sleep(config.requestGapMs * attempt);
    return call(path, params, attempt + 1);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`twitterapi.io ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

// One page (~20 tweets) of advanced search, sorted by "Top".
export async function searchTop(query) {
  const data = await call('/twitter/tweet/advanced_search', { query, queryType: 'Top', cursor: '' });
  return (data.tweets || []).map(normalize).filter(Boolean);
}

// Re-fetch tweets by ID to get fresh numbers (used for acceleration).
export async function lookup(ids) {
  if (!ids.length) return [];
  const data = await call('/twitter/tweets', { tweet_ids: ids.join(',') });
  return (data.tweets || []).map(normalize).filter(Boolean);
}

function pickMedia(t) {
  const list = t.extendedEntities?.media || t.extended_entities?.media || t.entities?.media || t.media || [];
  const m = list[0];
  if (!m) return { mediaType: null, mediaUrl: null, videoUrl: null };
  let videoUrl = null;
  const variants = m.video_info?.variants || [];
  const mp4s = variants.filter(v => v.content_type === 'video/mp4').sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
  if (mp4s.length) videoUrl = mp4s[Math.min(1, mp4s.length - 1)].url; // mid-quality is enough
  return { mediaType: m.type || 'photo', mediaUrl: m.media_url_https || m.media_url || null, videoUrl };
}

function normalize(t) {
  if (!t || !t.id) return null;
  const a = t.author || {};
  return {
    id: String(t.id),
    url: t.url || `https://x.com/${a.userName || 'i'}/status/${t.id}`,
    text: t.text || '',
    createdAt: new Date(t.createdAt).getTime() || Date.now(),
    likes: t.likeCount || 0,
    retweets: t.retweetCount || 0,
    replies: t.replyCount || 0,
    quotes: t.quoteCount || 0,
    views: t.viewCount || 0,
    bookmarks: t.bookmarkCount || 0,
    authorHandle: a.userName || '',
    authorName: a.name || '',
    authorAvatar: a.profilePicture || '',
    authorFollowers: a.followers || 0,
    hashtags: (t.entities?.hashtags || []).map(h => h.text),
    ...pickMedia(t),
  };
}
