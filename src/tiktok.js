// TikTok via ScrapeCreators (https://scrapecreators.com) — 1 credit per request, ~$1.88 per 1,000 credits.
// One keyword search returns a page (~12-20) of videos with full stats.
import { config } from './config.js';
import { setMeta } from './db.js';

const BASE = 'https://api.scrapecreators.com';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function call(path, params, attempt = 1) {
  const url = `${BASE}${path}?${new URLSearchParams(params)}`;
  const res = await fetch(url, { headers: { 'x-api-key': config.scrapeCreatorsKey } });
  if ((res.status === 429 || res.status >= 500) && attempt <= 2) {
    await sleep(3000 * attempt);
    return call(path, params, attempt + 1);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`scrapecreators ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  if (data.credits_remaining != null) setMeta('tiktokCredits', data.credits_remaining);
  return data;
}

// Most-liked videos from the last day for a search term.
export async function tiktokSearch(query) {
  const data = await call('/v1/tiktok/search/keyword', {
    query,
    sort_by: 'most-liked',
    date_posted: 'yesterday',
    region: config.tiktokRegion,
  });
  const items = data.search_item_list || data.aweme_list || data.data || data.videos || [];
  return items.map(it => normalize(it.aweme_info || it)).filter(Boolean);
}

const firstUrl = o => o?.url_list?.[0] || null;

function normalize(v) {
  const id = v?.aweme_id || v?.id;
  if (!id) return null;
  const st = v.statistics || v.stats || {};
  const a = v.author || {};
  const handle = a.unique_id || a.uniqueId || '';
  const created = Number(v.create_time || v.createTime) * 1000;
  return {
    id: `tt_${id}`,
    platform: 'tiktok',
    url: v.url || v.share_url || `https://www.tiktok.com/@${handle}/video/${id}`,
    text: v.desc || '',
    createdAt: Number.isFinite(created) && created > 0 ? created : Date.now(),
    likes: st.digg_count ?? st.diggCount ?? 0,
    retweets: st.share_count ?? st.shareCount ?? 0, // shares play the role of reposts
    replies: st.comment_count ?? st.commentCount ?? 0,
    quotes: 0,
    views: st.play_count ?? st.playCount ?? 0,
    bookmarks: st.collect_count ?? st.collectCount ?? 0,
    authorHandle: handle,
    authorName: a.nickname || '',
    authorAvatar: firstUrl(a.avatar_thumb) || firstUrl(a.avatar_medium) || '',
    authorFollowers: a.follower_count ?? a.followerCount ?? 0,
    hashtags: (v.text_extra || []).map(t => t.hashtag_name).filter(Boolean),
    mediaType: 'video',
    mediaUrl: firstUrl(v.video?.cover) || firstUrl(v.video?.origin_cover) || firstUrl(v.video?.dynamic_cover) || null,
    videoUrl: null,
  };
}
