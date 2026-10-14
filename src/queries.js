// What the scanner hunts for. Tuned for things that tend to become meme coins:
// a nameable CHARACTER (usually an animal), a phrase people repeat, or something a big account posted.
//
// Each category = one X advanced-search query per scan (~$0.003 each).
// Every query automatically gets: since_time:<lookback> -filter:replies -filter:nativeretweets
// plus the crypto-shill filter below, so you see the raw narrative, not people shilling it.
// Search syntax: https://github.com/igorbrigadir/twitter-advanced-search

const ANIMALS = ['dog', 'cat', 'puppy', 'kitten', 'hippo', 'otter', 'capybara', 'penguin', 'monkey', 'goat',
  'raccoon', 'frog', 'duck', 'pig', 'cow', 'horse', 'bird', 'seal', 'bear', 'panda', 'sloth', 'giraffe',
  'elephant', 'rhino', 'lemur', 'tiger', 'lion', 'parrot', 'crow', 'hamster', 'bunny', 'rabbit', 'fox',
  'owl', 'shiba', 'doge', 'pup', 'kitty', 'squirrel', 'possum', 'opossum', 'deer', 'moose', 'alpaca', 'llama'];
export { ANIMALS };

// Accounts whose posts regularly spawn coins. Override with BIG_ACCOUNTS=elonmusk,MrBeast,...
export const BIG_ACCOUNTS = (process.env.BIG_ACCOUNTS || 'elonmusk,MrBeast,SnoopDogg,cb_doge,DogeDesigner')
  .split(',').map(s => s.trim()).filter(Boolean);

const or = list => `(${list.join(' OR ')})`;

export const CATEGORIES = [
  {
    id: 'named_animal',
    label: 'Named animals',
    emoji: '🏷️',
    query: `("his name is" OR "her name is" OR "named him" OR "named her" OR "meet" OR "say hi to") ${or(ANIMALS.slice(0, 22))} filter:media min_faves:800`,
    keywords: ['his name is', 'her name is', 'named him', 'named her', 'meet '],
  },
  {
    id: 'zoo_baby',
    label: 'Zoo & baby animals',
    emoji: '🦛',
    query: `(zoo OR newborn OR "baby" OR hatched OR "just born" OR sanctuary) (hippo OR penguin OR otter OR capybara OR panda OR giraffe OR elephant OR rhino OR sloth OR lemur OR seal OR tiger OR lion OR gorilla OR flamingo) filter:media min_faves:1500`,
    keywords: ['zoo', 'newborn', 'hatched', 'just born', 'sanctuary'],
  },
  {
    id: 'animal_character',
    label: 'Animal characters',
    emoji: '🐾',
    query: `(dog OR cat OR goat OR raccoon OR monkey OR frog OR duck OR pig OR parrot OR crow OR hamster OR possum) (refuses OR "acts like" OR "thinks he" OR "thinks she" OR "won't stop" OR "every day" OR "this guy" OR bro OR "the way he" OR "the way she") filter:videos min_faves:3000`,
    keywords: ['refuses', 'acts like', 'thinks he', 'thinks she', "won't stop", 'the way he', 'the way she'],
  },
  {
    id: 'animal_rescue',
    label: 'Rescue / abused animals',
    emoji: '🆘',
    query: `(rescued OR rescue OR abandoned OR abused OR stray OR "saved this") (dog OR cat OR puppy OR kitten OR horse OR animal OR baby) filter:media min_faves:2000`,
    keywords: ['rescue', 'rescued', 'abandoned', 'abused', 'stray', 'saved', 'shelter', 'injured', 'neglected'],
  },
  {
    id: 'big_account',
    label: 'Big accounts',
    emoji: '⭐',
    query: `${or(BIG_ACCOUNTS.map(a => `from:${a}`))} filter:media min_faves:5000`,
    keywords: [],
  },
  {
    id: 'catchphrase',
    label: 'Catchphrases & sounds',
    emoji: '🗣️',
    query: `("everyone is saying" OR "everyone keeps saying" OR "new slang" OR "the way he said" OR "the way she said" OR "this sound" OR "keeps saying" OR catchphrase) filter:videos min_faves:3000`,
    keywords: ['everyone is saying', 'keeps saying', 'new slang', 'the way he said', 'the way she said', 'catchphrase'],
  },
  {
    id: 'funny',
    label: 'Funny characters',
    emoji: '😂',
    query: `(lmao OR lmfao OR 💀 OR "this guy" OR "bro really" OR "no way" OR "im crying") filter:videos min_faves:10000 -UCL -NBA -NFL -goal -match`,
    keywords: ['lmao', 'lmfao', '💀', 'this guy', 'bro really', 'im crying'],
  },
  {
    id: 'weird',
    label: 'Weird & natural events',
    emoji: '👽',
    query: `("world's first" OR "world's smallest" OR "world's biggest" OR "rare footage" OR bizarre OR "never seen" OR tornado OR volcano OR aurora OR meteor OR waterspout OR "two-headed") filter:media min_faves:3000`,
    keywords: ["world's first", "world's smallest", 'rare', 'bizarre', 'never seen', 'tornado', 'volcano', 'aurora', 'meteor', 'waterspout'],
  },
  {
    id: 'viral',
    label: 'Anything viral',
    emoji: '🔥',
    query: 'filter:videos min_faves:30000 -UCL -NBA -NFL -goal -match -senador -senado',
    keywords: [],
  },
];

export const CATEGORY_BY_ID = Object.fromEntries(CATEGORIES.map(c => [c.id, c]));

// Keeps out posts that are already crypto shilling (we want the narrative BEFORE the coin).
const NO_SHILL = '-giveaway -airdrop -presale -nft -"pump.fun" -"contract address" -"CA:"';

// English only by default (where coin narratives spread). SEARCH_LANG= (empty) to search all languages.
const LANG = process.env.SEARCH_LANG ?? 'en';

export function buildQuery(cat, lookbackHours) {
  const since = Math.floor(Date.now() / 1000 - lookbackHours * 3600);
  return `${cat.query} since_time:${since} -filter:replies -filter:nativeretweets ${NO_SHILL}${LANG ? ` lang:${LANG}` : ''}`;
}
