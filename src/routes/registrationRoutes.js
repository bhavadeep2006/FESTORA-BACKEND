const express = require('express');
const router = express.Router();
const {
  registerForEvent,
  getMyRegistrations,
  getMyRegistrationById,
  cancelMyRegistration
} = require('../controllers/registrationController');
const { verifyToken } = require('../middleware/authMiddleware');

// Registration endpoints
router.post('/events/:eventId/register', verifyToken, registerForEvent);
router.get('/my-registrations', verifyToken, getMyRegistrations);
router.get('/my-registrations/:id', verifyToken, getMyRegistrationById);
router.delete('/my-registrations/:id', verifyToken, cancelMyRegistration);

module.exports = router;
