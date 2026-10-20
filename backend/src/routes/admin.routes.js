const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/admin.controller');
const auth    = require('../middleware/auth.middleware');

// Servicios
router.get('/:slug/services',       auth, ctrl.listServices);
router.post('/:slug/services',      auth, ctrl.createService);
router.patch('/:slug/services/:id', auth, ctrl.updateService);

// Profesionales
router.get('/:slug/professionals',        auth, ctrl.listProfessionals);
router.post('/:slug/professionals',       auth, ctrl.createProfessional);
router.patch('/:slug/professionals/:id',  auth, ctrl.updateProfessional);

// Horarios
router.get('/:slug/schedules/:professionalId', auth, ctrl.getSchedules);
router.put('/:slug/schedules/:professionalId', auth, ctrl.replaceSchedules);

// Negocio
router.patch('/:slug/business', auth, ctrl.updateBusiness);
// La foto llega como imagen binaria (el frontend la reduce a ~512px antes de enviarla)
router.put('/:slug/business/photo',    auth, express.raw({ type: 'image/*', limit: '1mb' }), ctrl.uploadPhoto);
router.delete('/:slug/business/photo', auth, ctrl.deletePhoto);

// Bloqueos
router.get('/:slug/blocks',     auth, ctrl.listBlocks);
router.post('/:slug/blocks',    auth, ctrl.createBlock);
router.delete('/:slug/blocks/:id', auth, ctrl.deleteBlock);

router.get('/:slug/professionals/:professionalId/services', auth, ctrl.getProfessionalServices);
router.put('/:slug/professionals/:professionalId/services', auth, ctrl.setProfessionalServices);

module.exports = router;