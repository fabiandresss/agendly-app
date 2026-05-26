// src/middleware/auth.middleware.js
// Intercepta cada request, extrae el JWT del header Authorization,
// lo verifica con Supabase y adjunta el usuario a req.user.
// Si el token no existe o es inválido, rechaza con 401.

const supabaseAdmin = require('../config/supabaseAdmin');

async function authMiddleware(req, res, next) {
  // El header debe venir como: "Authorization: Bearer eyJ..."
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No autorizado: falta el token' });
  }

  const token = authHeader.split(' ')[1];

  try {
    // Supabase Admin verifica la firma del JWT y nos da el usuario
    const { data, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !data?.user) {
      return res.status(401).json({ error: 'No autorizado: token inválido o expirado' });
    }

    // Adjuntar el usuario al request para usarlo en los controllers
    req.user = data.user;
    next(); // continuar al siguiente handler

  } catch (err) {
    console.error('[authMiddleware]', err.message);
    return res.status(401).json({ error: 'No autorizado' });
  }
}

module.exports = authMiddleware;