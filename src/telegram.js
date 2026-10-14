import { config } from './config.js';
import { CATEGORY_BY_ID } from './queries.js';
import * as store from './db.js';

const API = () => `https://api.telegram.org/bot${config.telegramToken}`;

async function tg(method, body) {
  const res = await fetch(`${API()}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!data.ok) throw new Error(`telegram ${method}: ${data.description || res.status}`);
  return data.result;
}

const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
export const fmt = n => (n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : String(Math.round(n || 0)));
const ago = ms => {
  const m = Math.round((Date.now() - ms) / 60000);
  return m < 60 ? `${m}m` : `${(m / 60).toFixed(1)}h`;
};
const TIER = { mega: '🔥🔥🔥 MEGA', hot: '🔥🔥 HOT', warm: '🔥 WARM', mild: 'mild' };

function coinLine(c) {
  if (!c) return '🪙 Coin check: n/a';
  if (!c.count) return `🟢 <b>No coin yet</b> for "${esc(c.term)}"`;
  const t = c.top;
  return `🟡 ${c.count} coin(s) already on "${esc(c.term)}" — top: $${esc(t.symbol)} on ${esc(t.chain)}, ${fmt(t.mcap)} mcap, ${ago(t.createdAt)} old`;
}

export function alertText(p) {
  const cats = p.categories.map(id => CATEGORY_BY_ID[id]?.emoji + ' ' + (CATEGORY_BY_ID[id]?.label || id)).join(' · ');
  const lines = [
    `<b>${TIER[p.tier] || ''}</b>  heat ${p.score}${p.meme != null ? ` · 🪙 meme ${p.meme}` : ''}${p.heatingUp ? '  ⚡ heating up' : ''}`,
    p.memeName || p.ticker ? `🪙 <b>${esc(p.memeName || '')}</b>${p.ticker ? ` → $${esc(p.ticker)}` : ''}` : undefined,
    cats,
    '',
    esc(p.text.slice(0, 280)),
    '',
    `👁 ${fmt(p.views)}  ❤️ ${fmt(p.likes)}  🔁 ${fmt(p.retweets)}  💬 ${fmt(p.replies)}`,
    `⚡ ${fmt(p.velocity)} eng/hr · ${fmt(p.viewsPerHour)} views/hr · posted ${ago(p.createdAt)} ago`,
    `👤 @${esc(p.authorHandle)} (${fmt(p.authorFollowers)} followers)`,
  ];
  if (p.ai?.narrative) lines.push('', `🧠 ${esc(p.ai.narrative)}`);
  lines.push('', coinLine(p.coin), '', `<a href="${p.url}">Open on ${({ x: 'X', tiktok: 'TikTok', instagram: 'Instagram', reddit: 'Reddit' })[p.platform || 'x'] || 'X'} →</a>`);
  return lines.filter(l => l !== undefined).join('\n');
}

function targets() {
  return [...new Set([...config.telegramChatIds, ...store.subscribers.all()])];
}

export async function sendAlert(p) {
  if (!config.telegramToken) return false;
  const chats = targets();
  if (!chats.length) return false;
  const text = alertText(p);
  let sent = false;
  for (const chat_id of chats) {
    try {
      if (p.mediaUrl && text.length <= 1024) {
        await tg('sendPhoto', { chat_id, photo: p.mediaUrl, caption: text, parse_mode: 'HTML' });
      } else {
        await tg('sendMessage', { chat_id, text, parse_mode: 'HTML', link_preview_options: { url: p.url } });
      }
      sent = true;
    } catch (e) {
      console.log('[tg]', e.message);
      // fallback without the photo
      try { await tg('sendMessage', { chat_id, text, parse_mode: 'HTML' }); sent = true; } catch {}
    }
  }
  return sent;
}

// Long-polling bot: /start to subscribe, /stop to unsubscribe, /top for current top 5.
export async function startBot({ dashboardUrl } = {}) {
  if (!config.telegramToken) {
    console.log('[tg] No TELEGRAM_BOT_TOKEN — alerts disabled.');
    return;
  }
  try { await tg('deleteWebhook', {}); } catch {}
  try {
    await tg('setMyCommands', {
      commands: [
        { command: 'start', description: 'Get viral alerts here' },
        { command: 'top', description: 'Top 5 viral posts right now' },
        { command: 'stop', description: 'Stop alerts' },
      ],
    });
  } catch {}
  console.log('[tg] bot polling started');
  let offset = 0;
  const loop = async () => {
    for (;;) {
      try {
        const updates = await tg('getUpdates', { offset, timeout: 50, allowed_updates: ['message'] });
        for (const u of updates) {
          offset = u.update_id + 1;
          await handle(u.message, dashboardUrl).catch(e => console.log('[tg] handle', e.message));
        }
      } catch (e) {
        console.log('[tg] poll', e.message);
        await new Promise(r => setTimeout(r, 5000));
      }
    }
  };
  loop();
}

async function handle(msg, dashboardUrl) {
  if (!msg?.text) return;
  const chat_id = msg.chat.id;
  const userId = String(msg.from?.id || '');
  const cmd = msg.text.split(/[\s@]/)[0].toLowerCase();
  const allowed = !config.telegramAllowedUsers.length || config.telegramAllowedUsers.includes(userId);

  if (cmd === '/start') {
    if (!allowed) return tg('sendMessage', { chat_id, text: `Not authorized. Your user ID is ${userId}.` });
    store.subscribers.add(chat_id);
    return tg('sendMessage', {
      chat_id,
      parse_mode: 'HTML',
      text: `👀 <b>Trench Scout</b> is watching X.\nYou'll get pinged when a post hits heat ${config.alertScore}+ AND meme potential ${config.memeAlertScore}+.\n\n/top — top 5 right now\n/stop — pause alerts${dashboardUrl ? `\n\nDashboard: ${dashboardUrl}` : ''}`,
    });
  }
  if (cmd === '/stop') {
    store.subscribers.remove(chat_id);
    return tg('sendMessage', { chat_id, text: 'Alerts paused. Send /start to turn them back on.' });
  }
  if (cmd === '/top') {
    if (!allowed) return;
    const top = store.listPosts({ hours: 12, limit: 5 });
    if (!top.length) return tg('sendMessage', { chat_id, text: 'Nothing scanned yet — give it a few minutes.' });
    const text = top
      .map((p, i) => `${i + 1}. <b>${p.score}</b>${p.meme != null ? `/🪙${p.meme}` : ''} ${p.ticker ? `$${esc(p.ticker)} ` : ''}${p.categories.map(c => CATEGORY_BY_ID[c]?.emoji).join('')} ${esc(p.text.slice(0, 90))}…\n   ⚡${fmt(p.velocity)}/hr · ${p.coin?.count === 0 ? '🟢 no coin' : p.coin?.count ? `🟡 ${p.coin.count} coins` : ''} · <a href="${p.url}">open</a>`)
      .join('\n\n');
    return tg('sendMessage', { chat_id, text, parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
  }
}
