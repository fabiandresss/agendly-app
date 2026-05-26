require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const { scheduleReminderJob } = require('./src/jobs/reminder.job');

const app  = express();
const PORT = process.env.PORT || 3000;

// CORS compatible con Express 5
const corsOptions = {
  origin: '*',
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));

// Preflight para Express 5 — usa ruta específica en lugar de '*'
app.options('/{*path}', cors(corsOptions));

app.use(express.json());

// resto del archivo igual...

// Rutas
app.use('/api/auth',         require('./src/routes/auth.routes'));
app.use('/api/businesses',   require('./src/routes/business.routes'));
app.use('/api/appointments', require('./src/routes/appointment.routes'));
app.use('/api/availability', require('./src/routes/availability.routes'));
app.use('/api/dashboard', require('./src/routes/dashboard.routes'));
app.use('/api/admin',     require('./src/routes/admin.routes'));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use((req, res) => {
  res.status(404).json({ error: `Ruta no encontrada: ${req.method} ${req.path}` });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Error interno del servidor' });
});

app.listen(PORT, () => {
  console.log(`AGENDLY backend corriendo en http://localhost:${PORT}`);

  scheduleReminderJob();
});

