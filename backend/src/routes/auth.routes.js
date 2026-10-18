const express = require('express');
const router  = express.Router();
const authController = require('../controllers/auth.controller');
const authMiddleware = require('../middleware/auth.middleware');
const { authLimiter } = require('../middleware/rateLimiter');

router.post('/register', authLimiter, authController.register);
router.post('/login',    authLimiter, authController.login);
router.post('/forgot-password', authLimiter, authController.forgotPassword);
router.post('/reset-password',  authLimiter, authController.resetPassword);

// Protegidas — requieren estar logueado
router.post('/setup-business',  authMiddleware, authController.setupBusiness);
router.get('/my-business',      authMiddleware, authController.getMyBusiness);
router.post('/change-password', authMiddleware, authLimiter, authController.changePassword);

module.exports = router;
