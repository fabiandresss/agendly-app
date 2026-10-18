'use strict';
const express = require('express');
const router  = express.Router();
const businessController    = require('../controllers/business.controller');
const appointmentController = require('../controllers/appointment.controller');
const authMiddleware        = require('../middleware/auth.middleware');
const { publicLimiter }     = require('../middleware/rateLimiter');

router.get('/:slug',               publicLimiter, businessController.getBusinessBySlug);
router.get('/:slug/services',      publicLimiter, businessController.getServices);
router.get('/:slug/professionals', publicLimiter, businessController.getProfessionals);
router.get('/:slug/services/:serviceId/professionals', publicLimiter, businessController.getProfessionalsByService);
router.get('/:slug/appointments',  authMiddleware, appointmentController.getAppointments);

module.exports = router;