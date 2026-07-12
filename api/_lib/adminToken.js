import crypto from 'crypto';

const SECRET = process.env.DIGICHAT_ADMIN_CLAVE || '';
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

export function issueAdminToken() {
  const expires = Date.now() + TOKEN_TTL_MS;
  const sig = crypto.createHmac('sha256', SECRET).update(`admin:${expires}`).digest('hex');
  return `${expires}.${sig}`;
}

export function verifyAdminToken(token) {
  if (!token || typeof token !== 'string' || !SECRET) return false;
  const [expiresStr, sig] = token.split('.');
  const expires = Number(expiresStr);
  if (!expires || !sig || Date.now() > expires) return false;
  const expectedSig = crypto.createHmac('sha256', SECRET).update(`admin:${expires}`).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expectedSig, 'hex'));
  } catch {
    return false;
  }
}
