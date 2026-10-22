// Artist availability: when each artist can next take a booking, and which days are off.
//
// GET  /api/availability  -> public JSON the site uses to show waits and limit the booking date
// POST /api/availability  -> admin save; needs the X-Admin-Password header to match ADMIN_PASSWORD
//
// Stored as one private JSON file in Vercel Blob (BLOB_READ_WRITE_TOKEN is added by Vercel
// when the Blob store is connected to the project). For local testing without Blob, set
// AVAILABILITY_LOCAL_FILE to a JSON file path.

import { get, put } from '@vercel/blob';
import { createHash, timingSafeEqual } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const KEY = 'availability.json';

// The artists the admin can manage. Ids match data-artist attributes on the site.
const ARTISTS = [
  { id: 'neeraj-sidhu', name: 'Neeraj Sidhu', role: 'Bridal & occasion makeup' },
  { id: 'sunny-ali', name: 'Sunny Ali', role: 'Senior hair artist' },
  { id: 'saleem-salmani', name: 'Saleem Salmani', role: 'Senior hair artist' },
  { id: 'imran-ahmad', name: 'Imran Ahmad', role: 'Senior hair artist' },
  { id: 'azeem-alvi', name: 'Azeem Alvi', role: 'Senior hair artist' },
  { id: 'naushad', name: 'Naushad', role: 'Senior hair artist' },
  { id: 'nisha-sharma', name: 'Nisha Sharma', role: 'Makeup artist' },
];

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_BLOCKED = 200;
const MAX_NOTE = 120;

// Today's date in Chandigarh, as YYYY-MM-DD
function todayIST() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

function isRealDate(s) {
  if (typeof s !== 'string' || !DATE.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

// Clean one artist's settings; drops past blocked days and anything malformed
function cleanArtist(raw, today) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const next = isRealDate(src.nextAvailable) && src.nextAvailable > today ? src.nextAvailable : '';
  const blocked = Array.isArray(src.blocked)
    ? [...new Set(src.blocked.filter((d) => isRealDate(d) && d >= today))].sort().slice(0, MAX_BLOCKED)
    : [];
  return {
    accepting: src.accepting !== false,
    nextAvailable: next,
    note: typeof src.note === 'string' ? src.note.replace(/\s+/g, ' ').trim().slice(0, MAX_NOTE) : '',
    blocked,
  };
}

// Full public shape: every known artist, in site order, with settings filled in
function shape(stored) {
  const today = todayIST();
  const saved = (stored && stored.artists) || {};
  return {
    today,
    updatedAt: (stored && stored.updatedAt) || null,
    artists: ARTISTS.map((a) => ({ ...a, ...cleanArtist(saved[a.id], today) })),
  };
}

async function load() {
  const local = process.env.AVAILABILITY_LOCAL_FILE;
  if (local) {
    try { return JSON.parse(await readFile(local, 'utf8')); } catch { return null; }
  }
  const res = await get(KEY, { access: 'private', useCache: false });
  if (!res || res.statusCode !== 200) return null;
  return JSON.parse(await new Response(res.stream).text());
}

async function save(data) {
  const body = JSON.stringify(data);
  const local = process.env.AVAILABILITY_LOCAL_FILE;
  if (local) return writeFile(local, body);
  await put(KEY, body, {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
  });
}

function json(data, status = 200, cache = 'no-store') {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': cache },
  });
}

// Constant-time password check (hashing first makes the lengths equal)
function passwordOk(given) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected || typeof given !== 'string' || !given) return false;
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

export async function GET() {
  try {
    // Short shared cache so busy pages cost one Blob read every few seconds,
    // while a save from /admin shows on the site within about 10 seconds
    return json(shape(await load()), 200, 'public, max-age=0, s-maxage=5, stale-while-revalidate=5');
  } catch (err) {
    console.error('availability GET failed', err);
    return json({ error: 'Availability is not available right now.' }, 503);
  }
}

export async function POST(request) {
  if (!process.env.ADMIN_PASSWORD) {
    return json({ error: 'Admin password is not set up on the server yet.' }, 503);
  }
  if (!passwordOk(request.headers.get('x-admin-password'))) {
    // Slow down password guessing
    await new Promise((r) => setTimeout(r, 1000));
    return json({ error: 'Wrong password.' }, 401);
  }

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid request.' }, 400); }

  try {
    // Login check from the admin page: password is right, return current data
    if (body && body.verify) return json(shape(await load()));

    const today = todayIST();
    const incoming = (body && body.artists) || {};
    const artists = {};
    for (const a of ARTISTS) artists[a.id] = cleanArtist(incoming[a.id], today);
    const stored = { updatedAt: new Date().toISOString(), artists };
    await save(stored);
    return json(shape(stored));
  } catch (err) {
    console.error('availability POST failed', err);
    return json({ error: 'Could not save. Please try again.' }, 500);
  }
}
