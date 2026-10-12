import { getSettings, kvSet, caps, pinOK, hasKV } from './_lib.js';

const okTime = t => /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
const okChan = c => ['email', 'off'].includes(c);

export default async function handler(req, res) {
  const s = await getSettings();

  if (req.method === 'GET') {
    if (!pinOK(req)) return res.status(200).json({ facing: s.facing, caps: caps(), locked: true });
    return res.status(200).json({ settings: s, facing: s.facing, caps: caps(), locked: false });
  }

  if (req.method === 'POST') {
    if (!pinOK(req)) return res.status(401).json({ error: 'PIN needed' });
    if (!hasKV()) return res.status(400).json({ error: 'No settings store connected' });
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const next = {
      facing: {
        north: Number.isFinite(+body.facing?.north) ? +body.facing.north % 360 : s.facing.north,
        south: Number.isFinite(+body.facing?.south) ? +body.facing.south % 360 : s.facing.south,
      },
      people: s.people.map(p => {
        const n = (body.people || []).find(x => x.id === p.id) || {};
        return {
          ...p,
          time: okTime(n.time) ? n.time : p.time,
          channel: okChan(n.channel) ? n.channel : p.channel,
          email: typeof n.email === 'string' && n.email.includes('@') ? n.email.trim() : p.email,
        };
      }),
    };
    await kvSet('settings', next);
    return res.status(200).json({ ok: true, settings: next });
  }

  res.status(405).end();
}
