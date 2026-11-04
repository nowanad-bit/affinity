// Collects anonymous visit and click counts for the admin analytics page.
//
// POST /api/track  body { v: visitorId, p: page, e: [[type, key], ...] }  (sent by assets/track.js)
//
// Counts go into one Redis hash per day (Chandigarh time), "a:YYYY-MM-DD", with fields like
// "pv:sunny-ali" or "wa:salon", plus HyperLogLogs of visitor ids for unique visitor counts.
// No IP address, name or phone number is stored. Days are kept for 400 days.

import { isArtist, json } from './_store.js';
import { pipeline, redisReady } from './_redis.js';

const TTL = 400 * 24 * 3600;
const SOURCES = ['instagram', 'facebook', 'google', 'whatsapp', 'qr', 'direct', 'other'];
// The answers to "How did you hear about us?" in the booking forms
const HEARD = ['Instagram', 'Google search', 'Facebook', 'WhatsApp', 'Friend or family', 'Walked past the salon',
  'Wedding planner or photographer', 'Portfolio PDF or QR code', 'Returning client', 'Other'];
const BOTS = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|headless|lighthouse|monitor/i;

const isPage = (p) => p === 'home' || isArtist(p);
const isWho = (k) => k === 'salon' || isArtist(k);

// Which keys each event type accepts
const VALID = {
  pv: (k, p) => k === p,
  src: (k) => SOURCES.includes(k),
  wa: isWho,
  form: isWho,
  call: isWho,
  ig: isWho,
  heard: (k) => HEARD.includes(k),
  pkg: (k) => /^[\p{L}\p{N} &()+,.'\/-]{1,60}$/u.test(k),
  pdf: (k, p) => k === p,
  share: (k, p) => k === p,
  photo: (k, p) => k === p,
};

function todayIST() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

export async function POST(request) {
  // Always answer quickly and quietly: tracking must never get in the visitor's way
  const done = new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  if (!redisReady() || BOTS.test(request.headers.get('user-agent') || '')) return done;

  let body;
  try {
    const text = await request.text();
    if (text.length > 4000) return done;
    body = JSON.parse(text);
  } catch { return done; }

  const page = body && body.p;
  const visitor = body && body.v;
  if (!isPage(page) || typeof visitor !== 'string' || !/^[a-z0-9-]{8,40}$/i.test(visitor) || !Array.isArray(body.e)) return done;

  const day = 'a:' + todayIST();
  const cmds = [];
  let viewed = false;
  for (const ev of body.e.slice(0, 30)) {
    if (!Array.isArray(ev) || typeof ev[0] !== 'string' || typeof ev[1] !== 'string') continue;
    const [type, key] = ev;
    if (!VALID[type] || !VALID[type](key, page)) continue;
    cmds.push(['HINCRBY', day, type + ':' + key, 1]);
    if (type === 'pv') viewed = true;
  }
  if (!cmds.length) return done;
  cmds.push(['EXPIRE', day, TTL]);
  if (viewed) {
    cmds.push(['PFADD', day + ':uv', visitor], ['EXPIRE', day + ':uv', TTL]);
    cmds.push(['PFADD', day + ':uv:' + page, visitor], ['EXPIRE', day + ':uv:' + page, TTL]);
  }

  try { await pipeline(cmds); } catch (err) { console.error('track failed', err.message); }
  return done;
}

export function GET() {
  return json({ error: 'Use POST.' }, 405);
}
