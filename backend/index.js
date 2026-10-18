// El .env se busca junto a este archivo, no en la carpeta desde la que se lance el proceso
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const cors    = require('cors');
const { scheduleReminderJob } = require('./src/jobs/reminder.job');

const app  = express();
const PORT = process.env.PORT || 3000;

// Detrás de un proxy (Render, Railway, Nginx…) el rate limiter necesita
// confiar en X-Forwarded-For o todos los usuarios compartirían una IP.
// Actívalo con TRUST_PROXY=1 solo si realmente hay un proxy delante.
if (process.env.TRUST_PROXY) {
  app.set('trust proxy', Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);
}

// CORS: en producción define CORS_ORIGIN con la URL del frontend
// (varias separadas por coma). Sin definir, permite cualquier origen.
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(o => o.trim())
  : '*';

const corsOptions = {
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));

// Preflight para Express 5 — usa ruta específica en lugar de '*'
app.options('/{*path}', cors(corsOptions));

app.use(express.json({ limit: '100kb' }));

// Rutas
app.use('/api/auth',         require('./src/routes/auth.routes'));
app.use('/api/businesses',   require('./src/routes/business.routes'));
app.use('/api/appointments', require('./src/routes/appointment.routes'));
app.use('/api/availability', require('./src/routes/availability.routes'));
app.use('/api/dashboard',    require('./src/routes/dashboard.routes'));
app.use('/api/admin',        require('./src/routes/admin.routes'));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use((req, res) => {
  res.status(404).json({ error: `Ruta no encontrada: ${req.method} ${req.path}` });
});

app.use((err, req, res, next) => {
  // JSON mal formado o body demasiado grande: es culpa del cliente, no del servidor
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'El cuerpo de la petición no es un JSON válido' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'El cuerpo de la petición es demasiado grande' });
  }

  console.error(err.stack);
  res.status(500).json({ error: 'Error interno del servidor' });
});

app.listen(PORT, () => {
  console.log(`AGENDLY backend corriendo en http://localhost:${PORT}`);

  // DISABLE_REMINDER_JOB=1 evita que un entorno local envíe recordatorios
  // reales a las reservas de la base de datos compartida.
  if (process.env.DISABLE_REMINDER_JOB) {
    console.log('[reminder.job] Desactivado por DISABLE_REMINDER_JOB');
  } else {
    scheduleReminderJob();
  }
});
