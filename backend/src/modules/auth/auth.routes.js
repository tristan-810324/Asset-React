const express = require('express');
const authController = require('./auth.controller');
const authenticate = require('../../middleware/auth.middleware');

const router = express.Router();

router.post('/register', authController.registerBorrower);
router.post('/login', authController.login);
router.post('/verify-email-otp', authController.verifyEmailOtp);
router.post('/resend-email-verification-otp', authController.resendEmailVerificationOtp);
router.post('/forgot-password', authController.forgotPassword);
router.post('/verify-otp', authController.verifyOtp);
router.post('/reset-password', authController.resetPassword);
router.get('/me', authenticate, authController.currentUser);

module.exports = router;
