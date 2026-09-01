const express = require('express');
const router = express.Router();
const {
  register,
  login,
  verifyOtp,
  resendOtp,
  getMe,
  forgotPassword,
  resetPassword,
  googleAuth,
  googleCallback,
  googleVerifyToken
} = require('../controllers/authController');
const { verifyToken } = require('../middleware/authMiddleware');

// Student Auth Routes
router.post('/register', register);
if (verifyOtp) router.post('/verify-otp', verifyOtp);
if (resendOtp) router.post('/resend-otp', resendOtp);
router.post('/login', login);
router.get('/me', verifyToken, getMe);

// Forgot & Reset Password Routes
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

// Google OAuth Routes
router.get('/google', googleAuth);
router.get('/google/callback', googleCallback);
router.post('/google/verify-token', googleVerifyToken);

module.exports = router;
