import { sbSelect } from './_lib/supabaseRest.js';
import { verifyRoomPassword } from './_lib/roomPassword.js';

const attempts = new Map();
const WINDOW_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 8;

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
    res.status(429).json({ ok: false, error: 'Demasiados intentos, espera unos minutos.' });
    return;
  }

  const name = String(req.body?.name || '').trim();
  const password = String(req.body?.password || '');
  if (!name) {
    res.status(400).json({ ok: false, error: 'Falta el nombre de la sala.' });
    return;
  }

  try {
    const rows = await sbSelect(
      'chat_room_passwords',
      `room_name=eq.${encodeURIComponent(name)}&select=password_hash`
    );
    const ok = rows.length > 0 && verifyRoomPassword(password, rows[0].password_hash);

    if (ok) {
      attempts.delete(ip);
    } else if (!rec || now - rec.first > WINDOW_MS) {
      attempts.set(ip, { count: 1, first: now });
    } else {
      rec.count += 1;
    }

    res.status(ok ? 200 : 401).json({ ok });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || 'server_error' });
  }
}
