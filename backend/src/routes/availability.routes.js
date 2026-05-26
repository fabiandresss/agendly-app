// src/routes/availability.routes.js
// Endpoint público — no requiere autenticación.
// Los clientes lo usan al seleccionar fecha en el formulario de reserva.

const express = require('express');
const router  = express.Router();
const availabilityController = require('../controllers/availability.controller');

// GET /api/availability
router.get('/', availabilityController.getAvailability);

module.exports = router;