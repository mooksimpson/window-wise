# Window Wise 🪟

Tonight's wind and rain at 47 Womerah Lane, boiled down to: how far to close the North bed and South bed windows.

- `index.html`: the app (works on its own, even without Vercel)
- `advice.js`: the brains (forecast + window maths), shared by the app and the alerts
- `api/notify.js`: sends the evening email
- `api/settings.js`: saves email times (on/off) and window directions

Forecast comes from Open-Meteo (free, no key; uses BOM's ACCESS model for Sydney).

## 1. Put it on Vercel (5 min)

1. Make a new GitHub repo, drop these files in, push.
2. vercel.com → Add New → Project → import the repo → Deploy. No build settings needed.
3. Open the URL on both phones → Share → **Add to Home Screen**.

That's the app done. The rest is the evening alert.

## 2. Email alerts (free, via your Gmail)

1. Google Account → Security → turn on 2-Step Verification (if not already).
2. Search "App passwords" in your Google Account → create one called "Window Wise" → copy the 16 letters.
3. Vercel → your project → Settings → Environment Variables, add:

| Name | Value |
|---|---|
| `GMAIL_USER` | mooksimpson@gmail.com |
| `GMAIL_APP_PASSWORD` | the 16-letter app password |
| `CRON_SECRET` | any long random string |
| `APP_PIN` | a short household PIN (stops strangers editing settings) |

Redeploy after adding variables (Deployments → ⋯ → Redeploy).

## 3. The 6pm trigger (free)

Vercel's free plan only allows once-a-day cron at a fuzzy time, so use **cron-job.org** (free):

- New cronjob → URL: `https://YOUR-APP.vercel.app/api/notify?key=YOUR_CRON_SECRET`
- Schedule: every 15 minutes → Save.

Each ping checks the time in Sydney and only sends to whoever is due, once per evening. Daylight saving is handled.

## 4. Let each of you change your email time (optional, free)

Vercel → project → Storage → **Create** → *Upstash for Redis* (free plan) → connect to this project → redeploy.
Now the ⚙️ Settings screen saves for both of you. Without it, everyone gets email at 6pm and window directions save per phone.

## Tuning

- **Window directions**: defaults are 10° (north bed) and 190° (south bed), from the street line. In Settings, tap 🧭 at each window with the phone flat and its top edge pointing outside.
- **Too cautious / too relaxed?** Edit `THRESHOLDS` at the top of `advice.js`.

How it decides: for each hour 8pm to 7am it works out how much of the wind is blowing straight into each window (a wind 45° off counts at ~70%, a wind from behind counts as zero), weighs in gusts, and bumps it up if rain is being driven in or storms are about. The worst hour wins.
