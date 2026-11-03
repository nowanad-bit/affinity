// Shared helpers for the artist APIs: the artist list, Blob storage, admin password and
// per-artist PINs. Files starting with "_" in /api are not served as endpoints.
//
// Storage is Vercel Blob (BLOB_READ_WRITE_TOKEN). For local testing set LOCAL_STORE_DIR to a
// folder and everything is read from and written to files there instead.

import { get, put, del } from '@vercel/blob';
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises';
import path from 'node:path';

// The artists on the site. Ids match folder names and data-artist attributes.
export const ARTISTS = [
  { id: 'neeraj-sidhu', name: 'Neeraj Sidhu', role: 'Bridal & occasion makeup' },
  { id: 'sunny-ali', name: 'Sunny Ali', role: 'Senior hair artist' },
  { id: 'saleem-salmani', name: 'Saleem Salmani', role: 'Senior hair artist' },
  { id: 'imran-ahmad', name: 'Imran Ahmad', role: 'Senior hair artist' },
  { id: 'azeem-alvi', name: 'Azeem Alvi', role: 'Senior hair artist' },
  { id: 'naushad', name: 'Naushad', role: 'Senior hair artist' },
  { id: 'nisha-sharma', name: 'Nisha Sharma', role: 'Makeup artist' },
];
export const isArtist = (id) => ARTISTS.some((a) => a.id === id);

const LOCAL = process.env.LOCAL_STORE_DIR;

// ---- JSON files (private) ----
export async function readJson(key) {
  if (LOCAL) {
    try { return JSON.parse(await readFile(path.join(LOCAL, key), 'utf8')); } catch { return null; }
  }
  const res = await get(key, { access: 'private', useCache: false });
  if (!res || res.statusCode !== 200) return null;
  return JSON.parse(await new Response(res.stream).text());
}

export async function writeJson(key, data) {
  const body = JSON.stringify(data);
  if (LOCAL) {
    const file = path.join(LOCAL, key);
    await mkdir(path.dirname(file), { recursive: true });
    return writeFile(file, body);
  }
  await put(key, body, { access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json' });
}

// ---- Photos ----
// Tries a public blob first (served straight from Vercel's CDN). If the store only allows
// private blobs, saves privately and serves it through /api/profile?photo=<key>.
export async function savePhoto(key, bytes, contentType) {
  if (LOCAL) {
    const file = path.join(LOCAL, key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, bytes);
    return { key, src: '/api/profile?photo=' + encodeURIComponent(key) };
  }
  try {
    const blob = await put(key, bytes, { access: 'public', addRandomSuffix: false, contentType });
    return { key, src: blob.url };
  } catch (err) {
    await put(key, bytes, { access: 'private', addRandomSuffix: false, contentType });
    return { key, src: '/api/profile?photo=' + encodeURIComponent(key) };
  }
}

export async function readPhoto(key) {
  if (LOCAL) {
    try { return { bytes: await readFile(path.join(LOCAL, key)), contentType: 'image/jpeg' }; } catch { return null; }
  }
  const res = await get(key, { access: 'private' });
  if (!res || res.statusCode !== 200) return null;
  return { stream: res.stream, contentType: (res.blob && res.blob.contentType) || 'image/jpeg' };
}

export async function deletePhoto(key) {
  try {
    if (LOCAL) return await unlink(path.join(LOCAL, key));
    await del(key);
  } catch (err) {
    console.error('photo delete failed', key, err && err.message);
  }
}

// ---- Responses ----
export function json(data, status = 200, cache = 'no-store') {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': cache },
  });
}
export const pause = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- Admin password ----
// Constant-time check (hashing first makes the lengths equal)
export function adminOk(given) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected || typeof given !== 'string' || !given) return false;
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

// ---- Artist PINs ----
// Stored hashed (scrypt + salt) in one private file. After 8 wrong tries an artist's PIN is
// locked for 15 minutes, so a 6-digit PIN can't be guessed by brute force.
const PINS = 'artist-pins.json';
const MAX_FAILS = 8;
const LOCK_MS = 15 * 60 * 1000;

function hashPin(pin, salt) {
  return scryptSync(pin, salt, 32).toString('hex');
}

export async function loadPins() {
  return (await readJson(PINS)) || {};
}

export async function setPin(artist, pin) {
  const pins = await loadPins();
  if (pin === null) delete pins[artist];
  else {
    const salt = randomBytes(16).toString('hex');
    pins[artist] = { salt, hash: hashPin(pin, salt), setAt: new Date().toISOString() };
  }
  await writeJson(PINS, pins);
}

export const PIN_RE = /^\d{6}$/;

// Who is making this request? Returns { artist, admin } or { error, status }.
// Artists send X-Artist + X-Artist-Pin. Staff can use the admin password in X-Artist-Pin
// (to help an artist or undo a change) or in X-Admin-Password.
export async function whoIs(request, artistId) {
  const artist = artistId || request.headers.get('x-artist') || '';
  const pin = request.headers.get('x-artist-pin') || '';
  const adminPw = request.headers.get('x-admin-password') || '';
  if (adminOk(adminPw) || (pin && adminOk(pin))) {
    return isArtist(artist) ? { artist, admin: true } : { admin: true, artist: '' };
  }
  if (!isArtist(artist)) return { error: 'Choose your name.', status: 400 };
  if (!PIN_RE.test(pin)) { await pause(800); return { error: 'Wrong PIN.', status: 401 }; }

  const pins = await loadPins();
  const rec = pins[artist];
  if (!rec) return { error: 'No PIN is set for you yet. Ask the salon to set one in /admin.', status: 401 };
  if (rec.lockUntil && Date.now() < rec.lockUntil) {
    return { error: 'Too many wrong tries. Try again in 15 minutes or ask the salon.', status: 429 };
  }
  const ok = timingSafeEqual(Buffer.from(hashPin(pin, rec.salt), 'hex'), Buffer.from(rec.hash, 'hex'));
  if (!ok) {
    rec.fails = (rec.fails || 0) + 1;
    if (rec.fails >= MAX_FAILS) { rec.fails = 0; rec.lockUntil = Date.now() + LOCK_MS; }
    await writeJson(PINS, pins);
    await pause(800);
    return { error: 'Wrong PIN.', status: 401 };
  }
  if (rec.fails || rec.lockUntil) { rec.fails = 0; delete rec.lockUntil; await writeJson(PINS, pins); }
  return { artist, admin: false };
}
