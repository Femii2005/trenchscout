// Fake posts so you can see the dashboard without an API key (DEMO=1).
import * as store from './db.js';
import { scorePost, weighted } from './score.js';
import { categorize } from './classify.js';

const SAMPLES = [
  ['cute_animal', 'This baby hippo just discovered water for the first time and I can\'t stop watching 😭', 'video', 0.9, 48000, 2.1e6, 'hippo', 0],
  ['animal_rescue', 'Found this puppy abandoned in a box by the highway. Look at him now after 2 weeks 🥹', 'video', 2.5, 61000, 3.4e6, 'puppy', 3],
  ['nature', 'Waterspout forming off the coast of Florida right now. Never seen anything like this', 'video', 1.2, 22000, 1.6e6, 'waterspout', 0],
  ['funny', 'bro really tried to fight his own reflection for 4 minutes straight 💀💀', 'video', 3.5, 90000, 6.2e6, 'reflection', 12],
  ['cute_animal', 'A capybara wearing a tiny hat at the zoo. That\'s it. That\'s the post.', 'photo', 5, 35000, 1.1e6, 'capybara', 5],
  ['unique', 'World\'s smallest horse was born this morning. She weighs 4kg', 'photo', 1.8, 27000, 900000, 'horse', 1],
  ['meme', 'nah this guy is the final boss of customer service', 'video', 7, 120000, 9.5e6, 'boss', 9],
  ['wholesome', 'Grandpa learned how to skateboard at 81 to impress his grandkid. Made my day', 'video', 4, 40000, 2.2e6, 'grandpa', 0],
  ['cute_animal', 'This raccoon has been stealing cat food from my porch every night and now he waves at the camera', 'video', 0.6, 9000, 380000, 'raccoon', 0],
  ['nature', 'Purple aurora over Lagos?? is this real', 'photo', 2.2, 15000, 700000, 'aurora', 2],
  ['animal_rescue', 'Firefighters rescued a kitten stuck inside a wall for 3 days. Her name is now Ember', 'video', 9, 52000, 2.9e6, 'ember', 4],
  ['funny', 'The way this goat screams every time the farmer leaves lmao', 'video', 11, 33000, 1.4e6, 'goat', 7],
  ['viral', 'Penguin breaks out of the aquarium and walks into a sushi restaurant next door', 'video', 1.5, 70000, 4.1e6, 'penguin', 0],
  ['unique', 'Rare footage of a two-headed snake found in Texas backyard', 'video', 14, 18000, 1.2e6, 'snake', 6],
];

export function seedDemo() {
  const now = Date.now();
  SAMPLES.forEach(([cat, text, mediaType, ageH, likes, views, subject, coins], i) => {
    const post = {
      id: `demo${i}`,
      url: 'https://x.com',
      text,
      createdAt: now - ageH * 3_600_000,
      likes,
      retweets: Math.round(likes * 0.18),
      replies: Math.round(likes * 0.05),
      quotes: Math.round(likes * 0.03),
      views,
      bookmarks: Math.round(likes * 0.08),
      authorHandle: ['viralhog', 'animalsdoingthings', 'weathermaniac', 'crazyclips', 'buitengebieden', 'nowthisnews'][i % 6],
      authorName: 'Demo account',
      authorAvatar: '',
      authorFollowers: 120000 + i * 53000,
      hashtags: [],
      mediaType,
      mediaUrl: `https://picsum.photos/seed/scout${i}/640/640`,
      videoUrl: null,
    };
    // two fake snapshots so some posts show "heating up"
    const w = weighted(post);
    store.addSnapshot(post.id, now - 30 * 60_000, w * (i % 3 === 0 ? 0.6 : 0.93), views * 0.8);
    store.addSnapshot(post.id, now, w, views);
    const s = scorePost(post, store.snapshotsFor(post.id), now);
    store.upsertPost({
      ...post,
      ...s,
      categories: categorize(text, [cat]),
      subject,
      coin: coins
        ? { term: subject, count: coins, top: { symbol: subject.toUpperCase().slice(0, 6), name: subject, chain: 'solana', mcap: 40000 * coins * coins, createdAt: now - coins * 1_800_000, url: 'https://dexscreener.com' } }
        : { term: subject, count: 0, top: null },
      ai: i % 2 === 0 ? { narrative: `${subject[0].toUpperCase() + subject.slice(1)} clip spreading fast — strong mascot potential.`, subject, ticker: subject.toUpperCase().slice(0, 6) } : null,
      firstSeen: now,
      lastChecked: now,
      alerted: false,
    });
  });
  console.log(`[demo] seeded ${SAMPLES.length} sample posts`);
}
