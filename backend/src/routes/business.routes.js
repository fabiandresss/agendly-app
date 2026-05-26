const express = require('express');
const router  = express.Router();
const businessController    = require('../controllers/business.controller');
const appointmentController = require('../controllers/appointment.controller');
const authMiddleware         = require('../middleware/auth.middleware');

// Rutas públicas — no requieren autenticación
router.get('/:slug',               businessController.getBusinessBySlug);
router.get('/:slug/services',      businessController.getServices);
router.get('/:slug/professionals', businessController.getProfessionals);

// Rutas protegidas — requieren JWT válido
router.get('/:slug/appointments', authMiddleware, appointmentController.getAppointments);

// Profesionales por servicio (público — para el formulario de reservas)
router.get('/:slug/services/:serviceId/professionals', businessController.getProfessionalsByService);

module.exports = router;