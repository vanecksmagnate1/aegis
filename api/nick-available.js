import { sbSelect } from './_lib/supabaseRest.js';

// Equivalente al de portal-web/app/api/nick-available: solo boolean, nunca
// expone id/role/created_at de profiles a trafico anonimo.
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false });
    return;
  }

  const nick = String(req.body?.nick || '').trim();
  if (!nick) {
    res.status(200).json({ ok: true, available: true });
    return;
  }

  try {
    const rows = await sbSelect('profiles', `username=ilike.${encodeURIComponent(nick)}&select=id&limit=1`);
    res.status(200).json({ ok: true, available: !rows.length });
  } catch {
    res.status(500).json({ ok: false });
  }
}
