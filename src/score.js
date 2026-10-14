// Virality scoring. Raw totals don't matter for launches — SPEED does.

// TikTok numbers run far bigger than X for the same level of "viral" (autoplay views, easy likes).
// These scale them down so a heat of 80 means roughly the same thing on every platform. Tune if needed.
const SCALE = { x: 1, tiktok: 0.15, instagram: 0.3 };
const VIEW_SCALE = { x: 1, tiktok: 0.1, instagram: 0.3 };
const scaleOf = p => SCALE[p.platform || 'x'] ?? 1;

export function weighted(p) {
  // Reposts and quotes spread content further than likes, so they count more.
  return scaleOf(p) * (p.likes + 2 * p.retweets + 3 * p.quotes + p.replies + 0.5 * p.bookmarks);
}

export function ageHours(p, now = Date.now()) {
  return Math.max((now - p.createdAt) / 3_600_000, 0.25);
}

/**
 * snapshots: [{at, weighted, views}] oldest → newest (may be empty)
 * returns { velocity, viewsPerHour, accel, score, tier, heatingUp }
 */
export function scorePost(p, snapshots = [], now = Date.now()) {
  const h = ageHours(p, now);
  const w = weighted(p);
  const velocity = w / h; // engagement per hour since posting
  const viewsPerHour = p.views / h;
  const scaledViews = viewsPerHour * (VIEW_SCALE[p.platform || 'x'] ?? 1);

  // Acceleration: engagement rate in the latest window vs lifetime average.
  let accel = null;
  if (snapshots.length >= 2) {
    const a = snapshots[snapshots.length - 2];
    const b = snapshots[snapshots.length - 1];
    const dtH = (b.at - a.at) / 3_600_000;
    if (dtH > 0.05) {
      const recentRate = (b.weighted - a.weighted) / dtH;
      accel = velocity > 0 ? recentRate / velocity : null;
    }
  }

  // Score 0–100 (log scale so a mega-viral post doesn't flatten everything else)
  let score =
    20 * Math.log10(1 + velocity / 50) +      // 10k eng/h → ~46, 80k/h → ~64
    7 * Math.log10(1 + scaledViews / 5000);  // views boost (300k/h → ~12)
  if (h < 2) score += 10;        // brand new and already moving
  else if (h < 6) score += 5;
  if (accel !== null) {
    if (accel > 1.3) score += 10;   // speeding up
    else if (accel < 0.4) score -= 10; // dying
  }
  score = Math.max(0, Math.min(100, Math.round(score)));

  const tier = score >= 80 ? 'mega' : score >= 65 ? 'hot' : score >= 45 ? 'warm' : 'mild';
  return { velocity, viewsPerHour, accel, score, tier, heatingUp: accel !== null && accel > 1.3 };
}
