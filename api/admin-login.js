export default function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false });
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

  res.status(ok ? 200 : 401).json({ ok });
}
