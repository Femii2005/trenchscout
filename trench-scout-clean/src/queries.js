// Each category = one X advanced-search query per scan.
// Edit these freely: add words, raise/lower min_faves, add new categories.
// Every query automatically gets: since_time:<lookback> -filter:replies -filter:nativeretweets
// Search syntax reference: https://github.com/igorbrigadir/twitter-advanced-search

export const CATEGORIES = [
  {
    id: 'cute_animal',
    label: 'Cute animals',
    emoji: '🐾',
    query: '(puppy OR kitten OR doggo OR capybara OR hippo OR otter OR raccoon OR penguin OR monkey OR baby goat OR hamster OR "baby animal") filter:media min_faves:3000',
    keywords: ['puppy', 'kitten', 'dog', 'cat', 'capybara', 'hippo', 'otter', 'raccoon', 'penguin', 'monkey', 'goat', 'hamster', 'bunny', 'duck', 'pup', 'kitty', 'fox', 'panda', 'sloth', 'frog'],
  },
  {
    id: 'animal_rescue',
    label: 'Rescue / abused animals',
    emoji: '🆘',
    query: '(rescued OR rescue OR abandoned OR abused OR stray OR "saved this") (dog OR cat OR puppy OR kitten OR horse OR animal OR baby) filter:media min_faves:2000',
    keywords: ['rescue', 'rescued', 'abandoned', 'abused', 'stray', 'saved', 'shelter', 'injured', 'neglected'],
  },
  {
    id: 'funny',
    label: 'Funny',
    emoji: '😂',
    query: '(lmao OR lmfao OR 😂 OR 💀 OR hilarious OR "im crying") filter:videos min_faves:5000',
    keywords: ['lmao', 'lmfao', '😂', '💀', 'hilarious', 'crying', 'funniest', 'dead'],
  },
  {
    id: 'nature',
    label: 'Natural events',
    emoji: '🌪️',
    query: '(tornado OR volcano OR lightning OR aurora OR earthquake OR tsunami OR meteor OR waterspout OR eclipse OR "never seen anything like") filter:media min_faves:3000',
    keywords: ['tornado', 'volcano', 'lightning', 'aurora', 'earthquake', 'tsunami', 'meteor', 'waterspout', 'eclipse', 'storm', 'hurricane', 'sky', 'comet'],
  },
  {
    id: 'unique',
    label: 'Weird / unique',
    emoji: '👽',
    query: '("world\'s first" OR "world\'s smallest" OR "world\'s biggest" OR "rare footage" OR bizarre OR unusual OR "never seen before") filter:media min_faves:3000',
    keywords: ['first', 'smallest', 'biggest', 'rare', 'bizarre', 'unusual', 'weird', 'strange', 'never seen'],
  },
  {
    id: 'wholesome',
    label: 'Wholesome',
    emoji: '🥹',
    query: '(wholesome OR heartwarming OR "made my day" OR "faith in humanity") filter:media min_faves:3000',
    keywords: ['wholesome', 'heartwarming', 'made my day', 'faith in humanity', 'cutest', 'sweet'],
  },
  {
    id: 'meme',
    label: 'Memes',
    emoji: '🐸',
    query: '(meme OR "bro really" OR "no way" OR "this guy" OR "nah") filter:media min_faves:10000',
    keywords: ['meme', 'bro', 'nah', 'no way', 'this guy', 'pov', 'when you'],
  },
  {
    id: 'viral',
    label: 'Anything viral',
    emoji: '🔥',
    query: 'filter:videos min_faves:30000',
    keywords: [],
  },
];

export const CATEGORY_BY_ID = Object.fromEntries(CATEGORIES.map(c => [c.id, c]));

export function buildQuery(cat, lookbackHours) {
  const since = Math.floor(Date.now() / 1000 - lookbackHours * 3600);
  return `${cat.query} since_time:${since} -filter:replies -filter:nativeretweets`;
}
