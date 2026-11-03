// Artist portfolio content that each artist edits from /studio: phone, tagline, bio, services,
// rates, photos and Instagram reels. Dates live in /api/availability.
//
// GET  /api/profile?artist=sunny-ali  -> public profile (the built-in default until first save)
// GET  /api/profile?phones=1          -> { artists: { id: phone } } for artists who saved a number
// GET  /api/profile?photo=<key>       -> a photo saved in a private Blob store
// POST /api/profile                   -> { verify } | { profile } with X-Artist + X-Artist-Pin
//                                        admin only: { pins: 'list' } | { setPin: { artist, pin } }
//                                        | { clearPin: artist } with X-Admin-Password
// PUT  /api/profile?artist=<id>       -> upload one photo (JPEG/PNG/WebP body, max 4 MB)

import { ARTISTS, isArtist, readJson, writeJson, savePhoto, readPhoto, deletePhoto, json, whoIs, adminOk, pause, loadPins, setPin, PIN_RE } from './_store.js';
import DEFAULTS from './_defaults.js';
import { randomBytes } from 'node:crypto';

const key = (id) => `profiles/${id}.json`;

// ---- Cleaning: everything is plain text, trimmed and length-limited ----
const str = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b-\u001f]/g, '').replace(/[ \t]+/g, ' ').trim().slice(0, max) : '');
const list = (v, max) => (Array.isArray(v) ? v.slice(0, max) : []);

export function cleanPhone(v) {
  const digits = String(v || '').replace(/\D/g, '');
  const local = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits.length === 11 && digits.startsWith('0') ? digits.slice(1) : digits;
  return /^[6-9]\d{9}$/.test(local) ? '91' + local : '';
}

// "https://www.instagram.com/reel/ABC123/?igsh=..." -> "reel/ABC123"
export function cleanReel(v) {
  const s = String(v || '').trim();
  const m = s.match(/instagram\.com\/(?:[\w.]+\/)?(reels?|p|tv)\/([\w-]{5,40})/i) || s.match(/^(reel|p)\/([\w-]{5,40})$/);
  if (!m) return '';
  return (/^reel/i.test(m[1]) ? 'reel' : 'p') + '/' + m[2];
}

function okPhotoSrc(src, id) {
  return (
    src.startsWith(`/${id}/img/`) ||
    src.startsWith('/api/profile?photo=' + encodeURIComponent(`artist-photos/${id}/`)) ||
    /^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\/artist-photos\//i.test(src)
  );
}

function clean(raw, id) {
  const p = raw && typeof raw === 'object' ? raw : {};
  const phone = cleanPhone(p.phone);
  return {
    phone: phone || DEFAULTS[id].phone,
    tagline: str(p.tagline, 220),
    bio: list(p.bio, 4).map((t) => str(t, 900)).filter(Boolean),
    services: list(p.services, 6)
      .map((g) => ({ title: str(g && g.title, 40), items: list(g && g.items, 8).map((t) => str(t, 60)).filter(Boolean) }))
      .filter((g) => g.title || g.items.length),
    rates: list(p.rates, 8)
      .map((g) => ({
        title: str(g && g.title, 50),
        note: str(g && g.note, 160),
        items: list(g && g.items, 8)
          .map((r) => ({ name: str(r && r.name, 60), desc: str(r && r.desc, 220), price: str(r && r.price, 24) }))
          .filter((r) => r.name),
      }))
      .filter((g) => g.title && g.items.length),
    photos: list(p.photos, 24)
      .map((ph) => ({ src: str(ph && ph.src, 400), key: str(ph && ph.key, 200), caption: str(ph && ph.caption, 60) }))
      .filter((ph) => okPhotoSrc(ph.src, id) && (!ph.key || ph.key.startsWith(`artist-photos/${id}/`))),
    reels: [...new Set(list(p.reels, 12).map(cleanReel).filter(Boolean))],
  };
}

async function loadProfile(id) {
  const stored = await readJson(key(id));
  return stored ? { saved: true, updatedAt: stored.updatedAt, profile: { ...DEFAULTS[id], ...stored.profile } } : { saved: false, updatedAt: null, profile: DEFAULTS[id] };
}

export async function GET(request) {
  const url = new URL(request.url);
  try {
    const photo = url.searchParams.get('photo');
    if (photo) {
      if (!/^artist-photos\/[a-z-]+\/[\w.-]+$/.test(photo)) return json({ error: 'Not found.' }, 404);
      const file = await readPhoto(photo);
      if (!file) return json({ error: 'Not found.' }, 404);
      return new Response(file.stream || file.bytes, {
        headers: { 'Content-Type': file.contentType, 'Cache-Control': 'public, max-age=31536000, immutable' },
      });
    }

    if (url.searchParams.get('phones')) {
      const out = {};
      await Promise.all(ARTISTS.map(async (a) => {
        const s = await readJson(key(a.id));
        if (s && s.profile && s.profile.phone) out[a.id] = s.profile.phone;
      }));
      return json({ artists: out }, 200, 'public, max-age=0, s-maxage=30, stale-while-revalidate=60');
    }

    const id = url.searchParams.get('artist');
    if (!isArtist(id)) return json({ error: 'Unknown artist.' }, 404);
    return json({ artist: id, ...(await loadProfile(id)) }, 200, 'public, max-age=0, s-maxage=5, stale-while-revalidate=5');
  } catch (err) {
    console.error('profile GET failed', err);
    return json({ error: 'Profile is not available right now.' }, 503);
  }
}

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid request.' }, 400); }
  body = body || {};

  try {
    // ---- Admin: manage PINs ----
    if (body.pins || body.setPin || body.clearPin) {
      if (!adminOk(request.headers.get('x-admin-password'))) { await pause(1000); return json({ error: 'Wrong password.' }, 401); }
      if (body.setPin) {
        const { artist, pin } = body.setPin;
        if (!isArtist(artist)) return json({ error: 'Unknown artist.' }, 400);
        if (!PIN_RE.test(String(pin || ''))) return json({ error: 'The PIN must be exactly 6 digits.' }, 400);
        await setPin(artist, String(pin));
      }
      if (body.clearPin) {
        if (!isArtist(body.clearPin)) return json({ error: 'Unknown artist.' }, 400);
        await setPin(body.clearPin, null);
      }
      const pins = await loadPins();
      return json({ artists: ARTISTS.map((a) => ({ id: a.id, name: a.name, hasPin: !!pins[a.id], setAt: pins[a.id] ? pins[a.id].setAt : null, locked: !!(pins[a.id] && pins[a.id].lockUntil > Date.now()) })) });
    }

    // ---- Artist (or staff) ----
    const who = await whoIs(request);
    if (who.error) return json({ error: who.error }, who.status);
    if (!who.artist) return json({ error: 'Choose an artist.' }, 400);
    const id = who.artist;

    if (body.verify) return json({ artist: id, admin: who.admin, ...(await loadProfile(id)) });

    if (body.profile) {
      const before = await loadProfile(id);
      const profile = clean(body.profile, id);
      const updatedAt = new Date().toISOString();
      await writeJson(key(id), { updatedAt, updatedBy: who.admin ? 'admin' : id, profile });
      // Remove uploaded photos the artist deleted
      const keep = new Set(profile.photos.map((p) => p.key).filter(Boolean));
      await Promise.all((before.profile.photos || []).filter((p) => p.key && !keep.has(p.key)).map((p) => deletePhoto(p.key)));
      return json({ artist: id, saved: true, updatedAt, profile });
    }
    return json({ error: 'Nothing to save.' }, 400);
  } catch (err) {
    console.error('profile POST failed', err);
    return json({ error: 'Could not save. Please try again.' }, 500);
  }
}

const TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MAX_BYTES = 4 * 1024 * 1024;

export async function PUT(request) {
  const url = new URL(request.url);
  const id = url.searchParams.get('artist');
  try {
    const who = await whoIs(request, id);
    if (who.error) return json({ error: who.error }, who.status);
    if (!who.artist) return json({ error: 'Choose an artist.' }, 400);
    const type = (request.headers.get('content-type') || '').split(';')[0].trim();
    if (!TYPES[type]) return json({ error: 'Please upload a JPEG, PNG or WebP photo.' }, 415);
    const bytes = Buffer.from(await request.arrayBuffer());
    if (!bytes.length) return json({ error: 'The photo is empty.' }, 400);
    if (bytes.length > MAX_BYTES) return json({ error: 'That photo is too large (max 4 MB).' }, 413);
    const k = `artist-photos/${who.artist}/${Date.now()}-${randomBytes(4).toString('hex')}.${TYPES[type]}`;
    return json(await savePhoto(k, bytes, type));
  } catch (err) {
    console.error('photo upload failed', err);
    return json({ error: 'Upload failed. Please try again.' }, 500);
  }
}
