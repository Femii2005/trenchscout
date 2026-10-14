// "Meme potential": how likely a viral post is to become a meme coin.
// Works on any platform's post (X now; TikTok/Instagram/Reddit later) — it only needs text, author, media type.
//
// What tends to become a coin:
//   • a CHARACTER with a NAME (Moo Deng, Pnut, Hawk Tuah…) — the name *is* the ticker
//   • an animal, especially a baby/zoo/rescue animal with personality
//   • a phrase everyone is repeating
//   • anything a big account (Elon etc.) posts
// What usually doesn't: posts already shilling a coin, grim news, long news threads.

import { ANIMALS, BIG_ACCOUNTS } from './queries.js';

const NOT_NAMES = new Set(['The', 'This', 'That', 'These', 'Those', 'A', 'An', 'My', 'Our', 'Your', 'His', 'Her',
  'Their', 'Me', 'You', 'Him', 'Them', 'It', 'Its', 'Is', 'Was', 'And', 'But', 'So', 'Not', 'No', 'Yes', 'Mr',
  'Mrs', 'Ms', 'Dr', 'Baby', 'Little', 'Big', 'Little', 'Today', 'Everyone', 'Everybody', 'One', 'Two', 'New',
  'Zoo', 'Here', 'Just', 'Very', 'Sir', 'Lady', 'Guy', 'Girl', 'Boy', 'Man', 'Woman', 'Mom', 'Dad', 'God']);

const CAP = "[A-Z][a-zA-Z'’]{1,14}";
const NAME = `(${CAP}(?:[ -]${CAP})?)`;
// Lead-in words match any case ("His name is" / "his name is"); the name itself must be Capitalized.
const ci = w => w.replace(/[a-z]/g, c => `[${c}${c.toUpperCase()}]`);
const NAME_PATTERNS = [
  new RegExp(`\\b(?:${['his', 'her', 'its', 'their'].map(ci).join('|')}|${ci('the')} [a-z]+'?s) ${ci('name')}(?:'s| ${ci('is')}) ${NAME}`),
  new RegExp(`\\b${ci('named')} (?:him |her |it |them |the [a-z]+ )?${NAME}`),
  new RegExp(`\\b(?:${['called', 'nicknamed', 'dubbed', 'known as'].map(ci).join('|')}) ${NAME}`),
  new RegExp(`\\b(?:${['meet', 'say hi to', 'introducing'].map(ci).join('|')}) ${NAME}`),
];
// A short quoted phrase ("hawk tuah") — the phrase is the coin.
const QUOTE_RE = /["“]([A-Za-z][A-Za-z' ]{2,22}[A-Za-z])["”]/;

const ANIMAL_RE = new RegExp(`\\b(${ANIMALS.join('|')})s?\\b`, 'i');
const SHILL_RE = /\$[A-Za-z][A-Za-z0-9]{1,9}\b|\bCA:|\bcontract\b|\bpump\.fun\b|\bpresale\b|\bairdrop\b|\b100x\b|\b1000x\b|\bgem\b|\bape in\b|\bsolana\b|\bmemecoin\b|\bmeme coin\b/i;
const GRIM_RE = /\b(killed|murder(ed)?|shooting|shot dead|died|dead|death|war|bomb(ing)?|terror|crash(ed)?|lawsuit|arrested|charged|police|court|sentenced|fired)\b/i;
const NEWS_RE = /🚨|\bBREAKING\b|\bJUST IN\b|\bDEVELOPING\b|\bREPORT:/;
const POLITICS_RE = /\b(racis\w*|nationalis\w*|democrat\w*|republican\w*|liberal\w*|conservative\w*|leftist\w*|woke|immigra\w*|illegal alien\w*|senat\w*|congress\w*|president|minister|parliament|government|election\w*|vote\w*|politic\w*)\b/i;
const SPORTS_RE = /\b(UCL|POTM|EPL|NBA|NFL|MLB|NHL|UFC|FIFA|goal|goals|match|league|champions|Real Madrid|Barcelona|Arsenal|Chelsea|Liverpool|Man United|penalty|striker|midfielder|touchdown|playoffs?)\b|⚽|🏆/i;

const ANIMAL_CATS = new Set(['named_animal', 'zoo_baby', 'animal_character', 'animal_rescue', 'cute_animal']);
const BIG = new Set(BIG_ACCOUNTS.map(a => a.toLowerCase()));

export function extractName(text) {
  const clean = text.replace(/https?:\/\/\S+/g, '');
  for (const re of NAME_PATTERNS) {
    const m = clean.match(re);
    if (!m) continue;
    const words = m[1].split(/[ -]/).filter(w => !NOT_NAMES.has(w));
    if (!words.length) continue;
    const name = words.join(' ').replace(/['’]s$/, '');
    if (name.length >= 2) return name;
  }
  return null;
}

export const toTicker = s => (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10) || null;

/** returns { meme: 0-100, name, ticker, reasons: [] } */
const PLATFORM_NAME = { x: 'X', tiktok: 'TikTok', instagram: 'Instagram', reddit: 'Reddit' };

// cross = list of OTHER platforms where the same name is also blowing up (strongest breakout signal)
// knownName = this name is already showing up in other posts (so it's a real mascot, even if this caption has no animal word)
export function memePotential(post, categories = [], ai = null, cross = [], knownName = false) {
  const text = post.text || '';
  const reasons = [];
  let s = 20;

  let name = ai?.name || extractName(text);
  if (!name && categories.includes('catchphrase')) {
    const q = text.match(QUOTE_RE)?.[1];
    if (q && q.trim().split(/\s+/).length <= 4) name = q.trim();
  }
  const animal = text.match(ANIMAL_RE)?.[1]?.toLowerCase();
  const isBig = BIG.has((post.authorHandle || '').toLowerCase());
  const isPhrase = categories.includes('catchphrase');
  // A name only counts fully when it's a mascot (animal / catchphrase / big account), not a person in a news story
  const isNews = NEWS_RE.test(text) || GRIM_RE.test(text);
  if (name) { s += (animal || isPhrase || isBig || ai?.name || knownName) && !isNews ? 30 : 8; reasons.push(`name: ${name}`); }
  if (animal) { s += 15; reasons.push(animal); }
  if (categories.some(c => ANIMAL_CATS.has(c))) s += 10;

  if (isBig) { s += 25; reasons.push(`posted by @${post.authorHandle}`); }
  if (isPhrase) { s += 15; reasons.push('catchphrase'); }
  if (cross?.length) { s += 15; reasons.push(`🌐 also on ${cross.map(c => PLATFORM_NAME[c] || c).join(' + ')}`); }
  if (post.mediaType === 'video' || post.mediaType === 'animated_gif') s += 5;

  if (SHILL_RE.test(text)) { s -= 35; reasons.push('already crypto talk'); }
  if (isNews) { s -= 20; reasons.push('news'); }
  if (POLITICS_RE.test(text)) { s -= 30; reasons.push('politics'); }
  if (SPORTS_RE.test(text)) { s -= 15; reasons.push('sports'); }
  if (text.length > 240) s -= 10;

  // Claude's read (if ANTHROPIC_API_KEY is set) is the better judge — weight it more.
  if (typeof ai?.coinability === 'number') {
    s = 0.4 * s + 0.6 * ai.coinability * 10;
    if (ai.why) reasons.unshift(ai.why);
  }

  const meme = Math.max(0, Math.min(100, Math.round(s)));
  const ticker = toTicker(name) || ai?.ticker || toTicker(animal) || null;
  return { meme, name: name || null, ticker, reasons };
}

// One number for "show me the best stuff first". Geometric mean: a post needs to be BOTH hot and coin-able
// to rank high — very hot but not coin-able (football, news) sinks; coin-able but dead also sinks.
export const bestScore = (heat, meme) => Math.round(Math.sqrt(Math.max(0, heat) * Math.max(0, meme)));
