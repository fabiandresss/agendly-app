const express = require('express');
const router  = express.Router();
const authController = require('../controllers/auth.controller');
const authMiddleware = require('../middleware/auth.middleware');

router.post('/register', authController.register);
router.post('/login',    authController.login);

// Protegida — requiere estar logueado
router.post('/setup-business', authMiddleware, authController.setupBusiness);
router.get('/my-business', authMiddleware, authController.getMyBusiness);

module.exports = router;