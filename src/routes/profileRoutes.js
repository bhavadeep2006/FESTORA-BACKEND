const express = require('express');
const router = express.Router();
const { getStudentProfile, updateStudentProfile } = require('../controllers/profileController');
const { verifyToken } = require('../middleware/authMiddleware');

// Protect profile routes with Student Authentication
router.get('/profile', verifyToken, getStudentProfile);
router.put('/profile', verifyToken, updateStudentProfile);

module.exports = router;
