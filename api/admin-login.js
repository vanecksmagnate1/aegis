import { issueAdminToken } from './_lib/adminToken.js';

const attempts = new Map();
const WINDOW_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function getIp(req) {
  const fwd = req.headers['x-forwarded-for'] || '';
  const first = Array.isArray(fwd) ? fwd[0] : fwd;
  return (first || '').split(',')[0].trim() || 'unknown';
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false });
    return;
  }

  await sleep(400 + Math.random() * 300);

  const ip = getIp(req);
  const now = Date.now();
  const rec = attempts.get(ip);
  if (rec && now - rec.first < WINDOW_MS && rec.count >= MAX_ATTEMPTS) {
    res.status(429).json({ ok: false, locked: true });
    return;
  }

  const { nombre, clave } = req.body || {};
  const expectedNombre = process.env.DIGICHAT_ADMIN_NOMBRE;
  const expectedClave = process.env.DIGICHAT_ADMIN_CLAVE;

  const ok =
    !!expectedNombre &&
    !!expectedClave &&
    nombre === expectedNombre &&
    clave === expectedClave;

  if (ok) {
    attempts.delete(ip);
  } else if (!rec || now - rec.first > WINDOW_MS) {
    attempts.set(ip, { count: 1, first: now });
  } else {
    rec.count += 1;
  }

  const token = ok ? issueAdminToken() : undefined;
  res.status(ok ? 200 : 401).json({ ok, token });
}
