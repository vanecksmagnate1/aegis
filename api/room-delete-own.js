import { sbSelect, sbUpdate, sbDelete } from './_lib/supabaseRest.js';

const LOCKED_ROOM = 'Sala General';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false });
    return;
  }

  const name = String(req.body?.name || '').trim();
  const nick = String(req.body?.nick || '').trim();
  if (!name || !nick) {
    res.status(400).json({ ok: false, error: 'Faltan datos.' });
    return;
  }

  try {
    const rows = await sbSelect(
      'chat_rooms',
      `name=eq.${encodeURIComponent(name)}&select=is_private,created_by`
    );
    const room = rows[0];
    if (!room || !room.is_private) {
      res.status(404).json({ ok: false, error: 'La sala no existe o no es privada.' });
      return;
    }
    if (!room.created_by || room.created_by.toLowerCase() !== nick.toLowerCase()) {
      res.status(403).json({ ok: false, error: 'Solo quien creó la sala puede borrarla.' });
      return;
    }

    await sbUpdate('chat_messages', 'room', name, { room: LOCKED_ROOM });
    await sbDelete('chat_rooms', 'name', name);
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || 'server_error' });
  }
}
