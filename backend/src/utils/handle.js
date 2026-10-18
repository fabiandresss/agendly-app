// src/utils/handle.js
// Envuelve un handler de Express con el manejo de errores común a los controllers:
//  - errores con statusCode (404, 403, 400…) → se devuelven tal cual al cliente
//  - cualquier otro error (BD, bug)           → se registra y se responde un 500
//    genérico, sin filtrar mensajes internos de Supabase.

'use strict';

function handle(fn, fallbackMessage = 'Error interno del servidor') {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      const status = err.statusCode || 500;
      if (status === 500) console.error(`[${req.method} ${req.originalUrl}]`, err.message);
      res.status(status).json({ error: status === 500 ? fallbackMessage : err.message });
    }
  };
}

module.exports = handle;
