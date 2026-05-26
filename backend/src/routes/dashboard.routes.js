const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/dashboard.controller');
const auth    = require('../middleware/auth.middleware');

router.get('/:slug/summary',              auth, ctrl.getSummary);
router.get('/:slug/by-period',            auth, ctrl.getByPeriod);
router.get('/:slug/top-services',         auth, ctrl.getTopServices);
router.get('/:slug/top-professionals',    auth, ctrl.getTopProfessionals);
router.get('/:slug/hourly-distribution',  auth, ctrl.getHourlyDistribution);

module.exports = router;