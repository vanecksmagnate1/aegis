import { sbSelect, sbUpdate, sbDelete, sbInsert } from './_lib/supabaseRest.js';

const LOCKED_ROOM = 'Sala General';

// Vercel Cron llama este endpoint (ver vercel.json). Si el proyecto tiene
// la env var CRON_SECRET configurada, Vercel manda automáticamente
// "Authorization: Bearer <CRON_SECRET>" — así nadie más puede dispararlo.
function isAuthorized(req) {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  return req.headers['authorization'] === `Bearer ${expected}`;
}

export default async function handler(req, res) {
  if (!isAuthorized(req)) {
    res.status(401).json({ ok: false });
    return;
  }

  try {
    const nowIso = new Date().toISOString();
    const expired = await sbSelect(
      'chat_rooms',
      `is_private=eq.true&expires_at=lt.${encodeURIComponent(nowIso)}&select=name`
    );

    for (const room of expired) {
      await sbUpdate('chat_messages', 'room', room.name, { room: LOCKED_ROOM });
      await sbInsert('chat_messages', {
        room: LOCKED_ROOM,
        nick: 'Sistema',
        color: '#000000',
        role: 'admin',
        kind: 'system',
        body: JSON.stringify({ type: 'notice', text: `La sala privada "${room.name}" se cerró automáticamente tras 4 horas.` }),
      });
      await sbDelete('chat_rooms', 'name', room.name);
    }

    res.status(200).json({ ok: true, closed: expired.map((r) => r.name) });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || 'server_error' });
  }
}
