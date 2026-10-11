// Window Wise: shared forecast + window logic (used by the page AND the alert function)

export const HOME = {
  name: '47 Womerah Lane, Darlinghurst',
  lat: -33.8771,
  lon: 151.2229,
};

// Womerah Ave / Womerah Lane run roughly west-north-west to east-south-east,
// so the "north" windows actually face a touch east of north. Tune in Settings
// (or use the compass button while standing at each window).
export const DEFAULT_FACING = { north: 10, south: 190 };

export const LEVELS = [
  { key: 'open', label: 'Open',         verb: 'leave it open',  color: '#2FB67C', emoji: '🟢' },
  { key: 'bit',  label: 'Closed a bit', verb: 'close it a bit', color: '#F2B632', emoji: '🟡' },
  { key: 'lot',  label: 'Closed a lot', verb: 'close it a lot', color: '#F07F3C', emoji: '🟠' },
  { key: 'shut', label: 'Fully closed', verb: 'shut it',        color: '#E5484D', emoji: '🔴' },
];

// Tweak these if the app is too jumpy or too relaxed for your house.
// Wind values are km/h actually pushing into the window (10 m forecast wind,
// so the terrace row already takes the edge off).
export const THRESHOLDS = {
  wind: [15, 25, 38],    // >= each -> level 1, 2, 3
  gustWeight: 0.6,       // gusts count at 60%
  rainMin: 0.2,          // mm/h that counts as rain
  rainLot: 1.5,          // mm/h + wind >= 12 -> closed a lot
  rainShut: 4,           // mm/h + wind >= 20 -> fully closed
  rainProbMin: 40,       // ignore rain under this % unless it's >= 0.5 mm
};

export const NIGHT_START = 20; // 8pm
export const NIGHT_END = 7;    // 7am

// ---------- data ----------

export function forecastUrl() {
  const p = new URLSearchParams({
    latitude: HOME.lat,
    longitude: HOME.lon,
    hourly: 'temperature_2m,precipitation,precipitation_probability,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant',
    timezone: 'Australia/Sydney',
    past_days: 1,
    forecast_days: 3,
    wind_speed_unit: 'kmh',
  });
  return `https://api.open-meteo.com/v1/forecast?${p}`;
}

export async function fetchForecast(fetchImpl = fetch) {
  const r = await fetchImpl(forecastUrl());
  if (!r.ok) throw new Error(`Forecast HTTP ${r.status}`);
  return r.json();
}

// ---------- helpers ----------

export function sydneyNow(d = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(d).map(p => [p.type, p.value])
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: +parts.hour, minute: +parts.minute };
}

export function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const POINTS = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
export const compass16 = deg => POINTS[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];
export const angDiff = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
export const fmtHour = h => (h === 0 ? 'midnight' : h === 12 ? 'noon' : h < 12 ? `${h}am` : `${h - 12}pm`);
export const shortHour = h => (h === 0 ? '12a' : h === 12 ? '12p' : h < 12 ? `${h}a` : `${h - 12}p`);
const r0 = n => Math.round(n);

export function dayName(dateStr) {
  return new Date(dateStr + 'T12:00:00Z').toLocaleDateString('en-AU', { weekday: 'long', timeZone: 'UTC' });
}
export function niceDate(dateStr) {
  return new Date(dateStr + 'T12:00:00Z').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

// WMO weather code -> icon + words
export function codeInfo(code, night = true) {
  if (code >= 95) return { icon: 'storm', text: 'Thunderstorms', sev: 6, emoji: '⛈️' };
  if (code >= 80) return { icon: 'rain', text: code >= 81 ? 'Heavy showers' : 'Showers', sev: 4, emoji: '🌦️' };
  if (code >= 71) return { icon: 'rain', text: 'Wintry mess', sev: 4, emoji: '🌨️' };
  if (code >= 61) return { icon: 'rain', text: code >= 65 ? 'Heavy rain' : 'Rain', sev: code >= 65 ? 5 : 4, emoji: '🌧️' };
  if (code >= 51) return { icon: 'drizzle', text: 'Drizzle', sev: 3, emoji: '🌦️' };
  if (code >= 45) return { icon: 'fog', text: 'Foggy', sev: 2, emoji: '🌫️' };
  if (code === 3) return { icon: 'cloud', text: 'Cloudy', sev: 1, emoji: '☁️' };
  if (code >= 1) return { icon: night ? 'partlyNight' : 'partlyDay', text: 'Partly cloudy', sev: 0.5, emoji: night ? '☁️' : '⛅' };
  return { icon: night ? 'moon' : 'sun', text: night ? 'Clear' : 'Sunny', sev: 0, emoji: night ? '🌙' : '☀️' };
}

// ---------- the brains ----------

function hourLevel(h, facing) {
  const T = THRESHOLDS;
  const diff = angDiff(h.dir, facing);
  const k = diff < 90 ? Math.cos(diff * Math.PI / 180) : 0;   // wind arriving FROM the direction the window faces
  const on = h.wind * k;
  const eff = Math.max(on, h.gust * k * T.gustWeight);
  const rainCounts = h.rain >= 0.5 || (h.rain >= T.rainMin && (h.prob ?? 100) >= T.rainProbMin);
  const rain = rainCounts ? h.rain : 0;
  const rainOn = on > 5 ? rain : on > 0 ? rain * 0.2 : 0;                 // vertical rain mostly misses the window

  let lvl = eff >= T.wind[2] ? 3 : eff >= T.wind[1] ? 2 : eff >= T.wind[0] ? 1 : 0;
  if (rainOn >= T.rainMin) lvl = Math.max(lvl, 1);
  if (rainOn >= T.rainLot && on >= 12) lvl = Math.max(lvl, 2);
  if (rainOn >= T.rainShut && on >= 20) lvl = 3;
  if (h.code >= 95) lvl = Math.max(lvl, on > 10 ? 3 : 2);
  return { lvl, on, eff, rainOn };
}

function faceAdvice(hours, facing) {
  const per = hours.map(h => ({ h, ...hourLevel(h, facing) }));
  const level = Math.max(...per.map(p => p.lvl));
  const maxOn = Math.max(...per.map(p => p.on));
  const worst = per.filter(p => p.lvl === level).sort((a, b) => b.eff - a.eff)[0] || per[0];
  const firstBad = per.find(p => p.lvl === level) || per[0];
  let reason;
  if (level === 0) {
    reason = maxOn < 5 ? 'Wind stays round the other side. Enjoy the air.' : `Just a gentle ${compass16(worst.h.dir)} breeze. Nothing rude.`;
  } else {
    const w = worst.h;
    reason = `${compass16(w.dir)} ${r0(w.wind)} km/h`;
    if (w.gust - w.wind >= 10) reason += `, gusts ${r0(w.gust)}`;
    reason += ` from ${fmtHour(firstBad.h.hour)}`;
    if (per.some(p => p.rainOn >= THRESHOLDS.rainMin)) reason += ', rain blowing in';
    if (hours.some(h => h.code >= 95)) reason = 'Storms about. ' + reason;
    reason += '.';
  }
  return { level, ...LEVELS[level], reason, perHour: per.map(p => ({ lvl: p.lvl, on: p.on })) };
}

export function buildAdvice(data, facing = DEFAULT_FACING, now = sydneyNow()) {
  const H = data.hourly;
  const nightDate = now.hour < NIGHT_END ? addDays(now.date, -1) : now.date;
  const morning = addDays(nightDate, 1);
  const a = H.time.indexOf(`${nightDate}T${String(NIGHT_START).padStart(2, '0')}:00`);
  const b = H.time.indexOf(`${morning}T${String(NIGHT_END).padStart(2, '0')}:00`);
  if (a < 0 || b < 0) throw new Error('Forecast does not cover tonight');

  const hours = [];
  for (let i = a; i <= b; i++) {
    hours.push({
      t: H.time[i], hour: +H.time[i].slice(11, 13),
      temp: H.temperature_2m[i], rain: H.precipitation[i] ?? 0,
      prob: H.precipitation_probability?.[i] ?? null, code: H.weather_code[i] ?? 0,
      wind: H.wind_speed_10m[i], dir: H.wind_direction_10m[i], gust: H.wind_gusts_10m[i] ?? H.wind_speed_10m[i],
    });
  }

  const north = faceAdvice(hours, facing.north);
  const south = faceAdvice(hours, facing.south);

  // overnight summary
  const start = hours[0], end = hours[hours.length - 1];
  const change = hours.find(h => angDiff(h.dir, start.dir) > 60 && h.wind >= 8);
  const rainTotal = hours.reduce((s, h) => s + h.rain, 0);
  const rainProb = Math.max(0, ...hours.map(h => h.prob ?? 0));
  const peak = hours.reduce((m, h) => (h.gust > m.gust ? h : m), hours[0]);
  const sky = hours.map(h => codeInfo(h.code)).sort((x, y) => y.sev - x.sev)[0];
  const low = Math.min(...hours.map(h => h.temp));
  const firstRain = hours.find(h => h.rain >= 0.2);
  const isSoutherly = d => angDiff(d, 190) < 40;

  let changeText = '';
  if (change) {
    changeText = isSoutherly(change.dir) && !isSoutherly(start.dir)
      ? `Southerly change around ${fmtHour(change.hour)}`
      : `Swings ${compass16(change.dir)} around ${fmtHour(change.hour)}`;
  }

  const night = {
    date: nightDate,
    startDir: compass16(start.dir), endDir: compass16(end.dir), endDeg: end.dir, startDeg: start.dir,
    windRange: `${r0(Math.min(...hours.map(h => h.wind)))}–${r0(Math.max(...hours.map(h => h.wind)))}`,
    maxWind: r0(Math.max(...hours.map(h => h.wind))), peakGust: r0(peak.gust), peakGustHour: peak.hour,
    changeText, rainTotal: Math.round(rainTotal * 10) / 10, rainProb, firstRainHour: firstRain?.hour ?? null,
    sky, low: r0(low),
  };

  // tomorrow
  const D = data.daily;
  const di = D.time.indexOf(morning);
  const tomorrow = di < 0 ? null : {
    date: morning, day: dayName(morning),
    ...codeInfo(D.weather_code[di], false),
    max: r0(D.temperature_2m_max[di]), min: r0(D.temperature_2m_min[di]),
    rain: Math.round((D.precipitation_sum[di] ?? 0) * 10) / 10, rainProb: D.precipitation_probability_max?.[di] ?? 0,
    wind: r0(D.wind_speed_10m_max[di]), gust: r0(D.wind_gusts_10m_max[di]), dir: compass16(D.wind_direction_10m_dominant[di]),
    dirDeg: D.wind_direction_10m_dominant[di],
  };
  if (tomorrow) {
    let s = `${tomorrow.text}, ${tomorrow.max}°`;
    s += tomorrow.rainProb >= 40 && tomorrow.rain >= 0.5 ? `, ${tomorrow.rain} mm likely` : tomorrow.rainProb >= 25 ? `, ${tomorrow.rainProb}% chance of a sprinkle` : ', dry';
    s += tomorrow.gust >= 45 ? `, blowy ${tomorrow.dir} (gusts ${tomorrow.gust})` : `, ${tomorrow.dir} wind to ${tomorrow.wind} km/h`;
    tomorrow.sentence = s + '.';
  }

  return { hours, north, south, night, tomorrow, facing, generated: now };
}

export function headline(adv) {
  const n = adv.night;
  let s = `${n.startDir} ${n.windRange} km/h`;
  if (n.changeText) s += `, ${n.changeText.toLowerCase()}`;
  else if (n.endDir !== n.startDir) s += `, easing ${n.endDir} by morning`;
  s += n.rainTotal >= 0.2 ? `. ${n.rainTotal} mm of rain${n.firstRainHour != null ? ` from ${fmtHour(n.firstRainHour)}` : ''}.` : '. Dry night.';
  return s;
}

// ---------- messages ----------

export function plainText(adv, url = '') {
  const n = adv.night;
  let s = `🪟 Tonight: North bed ${adv.north.label.toUpperCase()}, South bed ${adv.south.label.toUpperCase()}. `;
  s += `${n.startDir}→${n.endDir} to ${n.maxWind} km/h`;
  if (n.rainTotal >= 0.2) s += `, ${n.rainTotal}mm rain`;
  if (adv.tomorrow) s += `. Tmrw ${adv.tomorrow.emoji} ${adv.tomorrow.max}°`;
  return s + (url ? ` ${url}` : '');
}

export function emailSubject(adv) {
  return `🪟 North: ${adv.north.label} · South: ${adv.south.label}`;
}

export function emailHtml(adv, url = '') {
  const n = adv.night, t = adv.tomorrow;
  const block = (name, f) => `
    <td width="50%" style="padding:6px">
      <div style="background:${f.color};border-radius:18px;padding:18px 14px;color:#fff;text-align:center">
        <div style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;opacity:.9">${name}</div>
        <div style="font-size:24px;font-weight:800;margin:6px 0">${f.label}</div>
        <div style="font-size:13px;line-height:1.35;opacity:.95">${f.reason}</div>
      </div>
    </td>`;
  return `<!doctype html><html><body style="margin:0;background:#FBF6EE;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1F2A44">
  <div style="max-width:520px;margin:0 auto;padding:20px 14px">
    <div style="background:linear-gradient(160deg,#1E2A5A,#3D4F93);border-radius:22px;padding:22px 18px;color:#fff">
      <div style="font-size:13px;opacity:.75">${niceDate(n.date)} · Womerah Lane</div>
      <div style="font-size:22px;font-weight:800;margin-top:4px">Tonight's windows</div>
      <div style="font-size:15px;margin-top:8px;opacity:.9">${headline(adv)}</div>
    </div>
    <table width="100%" cellspacing="0" cellpadding="0" style="margin-top:10px"><tr>${block('North bed', adv.north)}${block('South bed', adv.south)}</tr></table>
    <table width="100%" cellspacing="0" cellpadding="0" style="margin-top:6px;text-align:center;font-size:13px"><tr>
      <td style="padding:6px"><div style="background:#fff;border-radius:14px;padding:10px 4px"><div style="font-size:24px">${n.sky.emoji}</div>${n.sky.text}</div></td>
      <td style="padding:6px"><div style="background:#fff;border-radius:14px;padding:10px 4px"><div style="font-size:24px">💨</div>${n.startDir} → ${n.endDir}<br>gusts ${n.peakGust}</div></td>
      <td style="padding:6px"><div style="background:#fff;border-radius:14px;padding:10px 4px"><div style="font-size:24px">💧</div>${n.rainTotal} mm<br>${n.rainProb}% chance</div></td>
      <td style="padding:6px"><div style="background:#fff;border-radius:14px;padding:10px 4px"><div style="font-size:24px">🌡️</div>Low ${n.low}°</div></td>
    </tr></table>
    ${t ? `<div style="background:#fff;border-radius:18px;padding:14px 16px;margin:10px 6px 0;font-size:15px"><b>${t.emoji} ${t.day}:</b> ${t.sentence}</div>` : ''}
    ${url ? `<div style="text-align:center;margin-top:18px"><a href="${url}" style="background:#1F2A44;color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:700;display:inline-block">See the night wind chart</a></div>` : ''}
  </div></body></html>`;
}

// ---------- sample data (used when the forecast can't be reached) ----------

export function sampleForecast(now = sydneyNow()) {
  const start = addDays(now.date, -1);
  const time = [], T = [], P = [], PP = [], C = [], W = [], Dd = [], G = [];
  for (let d = 0; d < 4; d++) {
    const date = addDays(start, d);
    for (let h = 0; h < 24; h++) {
      const x = d * 24 + h - 50; // southerly change ~2am on the coming night
      time.push(`${date}T${String(h).padStart(2, '0')}:00`);
      const after = x >= 0 && x < 10;
      T.push(after ? 15 : 19 + 4 * Math.sin((h - 9) / 24 * 2 * Math.PI));
      W.push(after ? 26 - x * 1.5 : 12 + 4 * Math.sin(h / 4));
      G.push(after ? 44 - x * 2 : 20 + 5 * Math.sin(h / 4));
      Dd.push(after ? 195 : 40 + 10 * Math.sin(h / 6));
      P.push(after && x < 5 ? [2.5, 3.2, 1.4, 0.6, 0.3][x] : 0);
      PP.push(after ? 80 : 10);
      C.push(after && x < 5 ? 80 : 2);
    }
  }
  const days = [0, 1, 2, 3].map(i => addDays(start, i));
  return {
    sample: true,
    hourly: { time, temperature_2m: T, precipitation: P, precipitation_probability: PP, weather_code: C, wind_speed_10m: W, wind_direction_10m: Dd, wind_gusts_10m: G },
    daily: {
      time: days, weather_code: [2, 2, 80, 1], temperature_2m_max: [24, 25, 19, 22], temperature_2m_min: [15, 16, 13, 14],
      precipitation_sum: [0, 0, 3.5, 0], precipitation_probability_max: [10, 20, 70, 10],
      wind_speed_10m_max: [18, 20, 28, 15], wind_gusts_10m_max: [30, 35, 48, 25], wind_direction_10m_dominant: [45, 50, 190, 120],
    },
  };
}
