// Shared server helpers (files starting with _ are not public endpoints on Vercel)
import { DEFAULT_FACING } from '../advice.js';

const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

export const hasKV = () => !!(KV_URL && KV_TOKEN);

export async function kvGet(key) {
  if (!hasKV()) return null;
  const r = await fetch(`${KV_URL}/get/${key}`, { headers: { Authorization: `Bearer ${KV_TOKEN}` } });
  const j = await r.json();
  return j.result ? JSON.parse(j.result) : null;
}

export async function kvSet(key, value) {
  if (!hasKV()) return;
  await fetch(`${KV_URL}/set/${key}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
    body: JSON.stringify(value),
  });
}

export function defaults() {
  return {
    facing: {
      north: +(process.env.NORTH_FACING ?? DEFAULT_FACING.north),
      south: +(process.env.SOUTH_FACING ?? DEFAULT_FACING.south),
    },
    people: [
      { id: 'mook', name: 'Mook', email: 'mooksimpson@gmail.com', time: '18:00', channel: 'email' },
      { id: 'lea', name: 'Lea', email: 'lea.simpson@nas.edu.au', time: '18:00', channel: 'email' },
    ],
  };
}

export async function getSettings() {
  const d = defaults();
  const s = await kvGet('settings').catch(() => null);
  if (!s) return d;
  return {
    facing: { ...d.facing, ...(s.facing || {}) },
    people: d.people.map(p => ({ ...p, ...((s.people || []).find(x => x.id === p.id) || {}) })),
  };
}

export const caps = () => ({
  kv: hasKV(),
  email: !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD),
});

export function pinOK(req) {
  const want = process.env.APP_PIN;
  if (!want) return true; // no PIN set = open (fine for a private URL, but set one)
  return (req.headers['x-pin'] || '') === want;
}

export function cronOK(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.authorization || '';
  const key = new URL(req.url, 'http://x').searchParams.get('key');
  return auth === `Bearer ${secret}` || key === secret;
}

// ---------- senders ----------

export async function sendEmail(to, subject, html, text) {
  const { default: nodemailer } = await import('nodemailer');
  const t = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
  });
  await t.sendMail({ from: `"Window Wise" <${process.env.GMAIL_USER}>`, to, subject, html, text });
}
