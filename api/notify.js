// Called every 15 minutes by a free scheduler (cron-job.org). Emails each person
// their summary at the time they picked. Also handles "Send me a test now".
import { fetchForecast, buildAdvice, plainText, emailSubject, emailHtml, headline, sydneyNow } from '../advice.js';
import { getSettings, kvGet, kvSet, hasKV, caps, pinOK, cronOK, sendEmail } from './_lib.js';

export default async function handler(req, res) {
  const url = new URL(req.url, 'http://x');
  const testId = url.searchParams.get('test');
  const appUrl = process.env.APP_URL || `https://${req.headers.host}`;
  const c = caps();

  // ---- test send from the settings screen ----
  if (testId) {
    if (!pinOK(req)) return res.status(401).json({ error: 'PIN needed' });
    const s = await getSettings();
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const formP = (body.people || []).find(p => p.id === testId);
    const p = { ...(s.people.find(x => x.id === testId) || {}), ...(formP || {}) };
    if (!p.id) return res.status(404).json({ error: 'Who?' });
    const facing = body.facing || s.facing;
    const adv = buildAdvice(await fetchForecast(), facing);
    try {
      const sent = await deliver(p, adv, appUrl, c);
      return res.status(200).json({ ok: true, sent });
    } catch (e) {
      return res.status(500).json({ error: String(e.message || e).slice(0, 140) });
    }
  }

  // ---- scheduled run ----
  if (!cronOK(req)) return res.status(401).json({ error: 'Bad key' });
  const s = await getSettings();
  const now = sydneyNow();
  const mins = now.hour * 60 + now.minute;
  const lastSent = (await kvGet('lastSent').catch(() => null)) || {};
  const windowMins = hasKV() ? 120 : 15; // with a store we can dedupe, so be forgiving of late pings

  const due = s.people.filter(p => {
    if (p.channel === 'off') return false;
    const [h, m] = p.time.split(':').map(Number);
    const t = h * 60 + m;
    return mins >= t && mins < t + windowMins && lastSent[p.id] !== now.date;
  });
  if (!due.length) return res.status(200).json({ ok: true, due: 0, at: `${now.date} ${now.hour}:${String(now.minute).padStart(2, '0')}` });

  const adv = buildAdvice(await fetchForecast(), s.facing);
  const log = [];
  for (const p of due) {
    try {
      log.push({ id: p.id, sent: await deliver(p, adv, appUrl, c) });
      lastSent[p.id] = now.date;
    } catch (e) {
      log.push({ id: p.id, error: String(e.message || e).slice(0, 200) });
    }
  }
  await kvSet('lastSent', lastSent);
  res.status(200).json({ ok: true, log, headline: headline(adv) });
}

async function deliver(p, adv, appUrl, c) {
  if (!c.email) throw new Error('Email not set up (GMAIL_USER / GMAIL_APP_PASSWORD)');
  if (!p.email) throw new Error('No email address');
  await sendEmail(p.email, emailSubject(adv), emailHtml(adv, appUrl), `${plainText(adv)}\n\n${appUrl}`);
  return ['email'];
}
