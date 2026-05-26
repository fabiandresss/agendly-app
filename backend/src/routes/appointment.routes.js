const express = require('express');
const router  = express.Router();
const appointmentController = require('../controllers/appointment.controller');

// POST   /api/appointments              — crear reserva
router.post('/', appointmentController.createAppointment);

// GET    /api/businesses/:slug/appointments — listar reservas del negocio
// (esta ruta se registra desde business.routes.js, ver abajo)

// PATCH  /api/appointments/:id/status   — cambiar estado
router.patch('/:id/status', appointmentController.updateStatus);

module.exports = router;