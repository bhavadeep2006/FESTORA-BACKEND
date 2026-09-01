const express = require('express');
const router = express.Router();
const { login, getMe } = require('../controllers/organizerController');
const {
  getOrganizerDashboardSummary,
  getEventDashboardStats,
  exportEventParticipantsCSV,
  getEventRegistrations,
  getAllOrganizerRegistrations
} = require('../controllers/organizerDashboardController');
const { verifyOrganizerToken } = require('../middleware/organizerAuthMiddleware');

// Public Organizer Auth Routes
router.post('/login', login);

// Protected Organizer Dashboard & Registrations Routes
router.get('/me', verifyOrganizerToken, getMe);
router.get('/dashboard', verifyOrganizerToken, getOrganizerDashboardSummary);
router.get('/registrations-all', verifyOrganizerToken, getAllOrganizerRegistrations);
router.get('/events/:eventId/dashboard', verifyOrganizerToken, getEventDashboardStats);
router.get('/events/:eventId/export', verifyOrganizerToken, exportEventParticipantsCSV);
router.get('/events/:eventId/registrations', verifyOrganizerToken, getEventRegistrations);

module.exports = router;
