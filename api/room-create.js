import { sbInsert, sbSelect, sbDelete, sbCount } from './_lib/supabaseRest.js';
import { hashRoomPassword } from './_lib/roomPassword.js';

const MAX_ROOM_NAME_LEN = 24;
const MIN_PASSWORD_LEN = 4;
const ROOM_TTL_MS = 4 * 60 * 60 * 1000;

// Rate limit best-effort (en memoria, por instancia): evita que alguien
// spamee salas nuevas. Mismo patrón que admin-login.js.
const attempts = new Map();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function getIp(req) {
  const fwd = req.headers['x-forwarded-for'] || '';
  const first = Array.isArray(fwd) ? fwd[0] : fwd;
  return (first || '').split(',')[0].trim() || 'unknown';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false });
    return;
  }

  const ip = getIp(req);
  const now = Date.now();
  const rec = attempts.get(ip);
  if (rec && now - rec.first < WINDOW_MS && rec.count >= MAX_ATTEMPTS) {
    res.status(429).json({ ok: false, error: 'Demasiadas salas creadas, espera unos minutos.' });
    return;
  }

  const name = String(req.body?.name || '').trim();
  const password = String(req.body?.password || '');
  const nick = String(req.body?.nick || '').trim();

  if (!name || name.length > MAX_ROOM_NAME_LEN) {
    res.status(400).json({ ok: false, error: 'Nombre de sala inválido.' });
    return;
  }
  if (!password || password.length < MIN_PASSWORD_LEN) {
    res.status(400).json({ ok: false, error: `La contraseña debe tener al menos ${MIN_PASSWORD_LEN} caracteres.` });
    return;
  }
  if (!nick) {
    res.status(400).json({ ok: false, error: 'Falta el nick del creador.' });
    return;
  }

  try {
    const existing = await sbSelect('chat_rooms', `name=eq.${encodeURIComponent(name)}&select=name`);
    if (existing.length) {
      res.status(400).json({ ok: false, error: 'Ya existe una sala con ese nombre.' });
      return;
    }

    if (!rec || now - rec.first > WINDOW_MS) attempts.set(ip, { count: 1, first: now });
    else rec.count += 1;

    const count = await sbCount('chat_rooms');
    const expiresAt = new Date(now + ROOM_TTL_MS).toISOString();
    await sbInsert('chat_rooms', {
      name,
      is_locked: false,
      sort_order: count,
      is_private: true,
      created_by: nick,
      expires_at: expiresAt,
    });
    try {
      await sbInsert('chat_room_passwords', { room_name: name, password_hash: hashRoomPassword(password) });
    } catch (e) {
      await sbDelete('chat_rooms', 'name', name);
      throw e;
    }

    res.status(200).json({ ok: true, expiresAt });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || 'server_error' });
  }
}
