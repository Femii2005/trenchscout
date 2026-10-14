// Checks DexScreener for coins already launched on a name, so you know if you're early.
const cache = new Map(); // term → {at, result}

export async function coinCheck(term) {
  if (!term || term.length < 3) return null;
  const key = term.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 20 * 60_000) return hit.result;

  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(term)}`);
    if (!res.ok) return null;
    const data = await res.json();
    const t = key.replace(/[^a-z0-9]/g, '');
    const pairs = (data.pairs || []).filter(p => {
      const sym = (p.baseToken?.symbol || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const name = (p.baseToken?.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      return sym === t || name.includes(t);
    });
    // Only care about coins launched in the last 7 days (old coins aren't competing for this narrative)
    const recent = pairs.filter(p => p.pairCreatedAt && Date.now() - p.pairCreatedAt < 7 * 86_400_000);
    recent.sort((a, b) => (b.marketCap || b.fdv || 0) - (a.marketCap || a.fdv || 0));
    const top = recent[0];
    const result = {
      term,
      count: recent.length,
      top: top
        ? {
            symbol: top.baseToken?.symbol,
            name: top.baseToken?.name,
            chain: top.chainId,
            mcap: top.marketCap || top.fdv || 0,
            createdAt: top.pairCreatedAt,
            url: top.url,
          }
        : null,
    };
    cache.set(key, { at: Date.now(), result });
    return result;
  } catch {
    return null;
  }
}
