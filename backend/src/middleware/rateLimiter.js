'use strict';
const rateLimit = require('express-rate-limit');

const bookingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { error: 'Demasiados intentos de reserva. Espera 15 minutos e intenta de nuevo.' },
});

const publicLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { error: 'Demasiadas solicitudes. Intenta de nuevo en un momento.' },
});

const cancelLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { error: 'Demasiados intentos. Intenta de nuevo más tarde.' },
});

// Login / registro / cambio de contraseña: frena fuerza bruta
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { error: 'Demasiados intentos. Espera unos minutos e intenta de nuevo.' },
});

module.exports = { bookingLimiter, publicLimiter, cancelLimiter, authLimiter };
