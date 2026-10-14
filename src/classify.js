import { CATEGORIES } from './queries.js';
import { config } from './config.js';

const STOP = new Set(['the', 'this', 'that', 'with', 'from', 'just', 'what', 'when', 'your', 'have', 'they', 'will', 'video', 'watch', 'look', 'like', 'into', 'about', 'there', 'been', 'were', 'than', 'only', 'very', 'really', 'today', 'https']);

// Adds keyword-matched categories on top of whichever query found the post.
export function categorize(text, found = []) {
  const t = text.toLowerCase();
  const cats = new Set(found);
  for (const c of CATEGORIES) {
    if (c.keywords.some(k => t.includes(k))) cats.add(c.id);
  }
  if (cats.size > 1) cats.delete('viral'); // "viral" is only a fallback bucket
  return [...cats];
}

// Best-guess "subject" word for a coin name (used for the DexScreener check).
export function guessSubject(post) {
  const t = post.text.toLowerCase();
  for (const c of CATEGORIES) {
    for (const k of c.keywords) {
      if (k.length >= 3 && /^[a-z]+$/.test(k) && new RegExp(`\\b${k}\\b`).test(t) && c.id !== 'funny' && c.id !== 'meme') return k;
    }
  }
  if (post.hashtags?.length) return post.hashtags[0];
  const words = t.replace(/https?:\/\/\S+/g, '').match(/[a-z]{4,}/g) || [];
  return words.find(w => !STOP.has(w)) || null;
}

// Optional: Claude reads the post and suggests the narrative + a ticker. Only runs for hot posts.
export async function aiRead(post) {
  if (!config.anthropicKey) return null;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': config.anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: config.anthropicModel,
        max_tokens: 200,
        messages: [{
          role: 'user',
          content: `A post is going viral on X. Reply with ONLY JSON: {"narrative": "<one short line on what it is and why people care>", "subject": "<the main character/thing, 1-2 words>", "ticker": "<a catchy meme coin ticker, 3-8 letters, no $>"}\n\nPost by @${post.authorHandle} (${post.mediaType || 'text'}):\n${post.text.slice(0, 800)}`,
        }],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const txt = data.content?.[0]?.text || '';
    const json = JSON.parse(txt.slice(txt.indexOf('{'), txt.lastIndexOf('}') + 1));
    return { narrative: json.narrative, subject: json.subject, ticker: (json.ticker || '').toUpperCase().replace(/[^A-Z0-9]/g, '') };
  } catch {
    return null;
  }
}
