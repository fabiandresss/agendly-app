'use strict';
const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/appointment.controller');
const auth    = require('../middleware/auth.middleware');
const { bookingLimiter, cancelLimiter, publicLimiter } = require('../middleware/rateLimiter');

router.get('/by-token',      publicLimiter, ctrl.getByToken);
router.post('/cancel',       cancelLimiter, ctrl.cancelByToken);
router.post('/reschedule',   cancelLimiter, ctrl.rescheduleByToken);
router.post('/',             bookingLimiter, ctrl.createAppointment);
router.patch('/:id/status',  auth, ctrl.updateStatus);

module.exports = router;