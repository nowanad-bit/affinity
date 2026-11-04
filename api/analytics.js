// Analytics for the admin page: visitors, page views, sources, bookings and clicks.
//
// GET /api/analytics?from=YYYY-MM-DD&to=YYYY-MM-DD   (X-Admin-Password header required)
// Reads the per-day counts written by /api/track. Ranges are capped at 120 days.

import { ARTISTS, adminOk, json, pause } from './_store.js';
import { pipeline, redisReady } from './_redis.js';

const MAX_DAYS = 120;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function todayIST() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}
function addDays(s, n) {
  const d = new Date(s + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export async function GET(request) {
  if (!process.env.ADMIN_PASSWORD) return json({ error: 'Admin password is not set up on the server yet.' }, 503);
  if (!adminOk(request.headers.get('x-admin-password'))) {
    await pause(1000);
    return json({ error: 'Wrong password.' }, 401);
  }
  const artists = ARTISTS.map(({ id, name }) => ({ id, name }));
  if (!redisReady()) return json({ ready: false, artists });

  const q = new URL(request.url).searchParams;
  const today = todayIST();
  let to = DATE.test(q.get('to') || '') && q.get('to') <= today ? q.get('to') : today;
  let from = DATE.test(q.get('from') || '') ? q.get('from') : addDays(to, -29);
  if (from > to) [from, to] = [to, from];
  if (addDays(from, MAX_DAYS - 1) < to) from = addDays(to, -(MAX_DAYS - 1));

  const dates = [];
  for (let d = from; d <= to; d = addDays(d, 1)) dates.push(d);
  const pages = ['home', ...ARTISTS.map((a) => a.id)];

  // Per day: all counts and unique visitors. Then unique visitors across the whole range,
  // overall and per page (a visitor who came on 3 days counts once).
  const cmds = [];
  for (const d of dates) cmds.push(['HGETALL', 'a:' + d], ['PFCOUNT', 'a:' + d + ':uv']);
  cmds.push(['PFCOUNT', ...dates.map((d) => 'a:' + d + ':uv')]);
  for (const p of pages) cmds.push(['PFCOUNT', ...dates.map((d) => 'a:' + d + ':uv:' + p)]);

  let res;
  try { res = await pipeline(cmds); } catch (err) {
    console.error('analytics failed', err.message);
    return json({ error: 'Could not load analytics. Please try again.' }, 502);
  }

  const totals = {};
  const days = dates.map((date, i) => {
    const flat = res[i * 2] || [];
    let views = 0;
    for (let j = 0; j < flat.length; j += 2) {
      const n = Number(flat[j + 1]) || 0;
      totals[flat[j]] = (totals[flat[j]] || 0) + n;
      if (flat[j].startsWith('pv:')) views += n;
    }
    return { date, visitors: Number(res[i * 2 + 1]) || 0, views };
  });
  const base = dates.length * 2;
  const pageVisitors = {};
  pages.forEach((p, i) => { pageVisitors[p] = Number(res[base + 1 + i]) || 0; });

  return json({
    ready: true,
    from,
    to,
    artists,
    days,
    visitors: Number(res[base]) || 0,
    pageVisitors,
    counts: totals,
  });
}
