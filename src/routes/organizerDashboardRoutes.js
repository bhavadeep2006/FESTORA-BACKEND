const express = require('express');
const router = express.Router();
const {
  getOrganizerDashboardSummary,
  getEventDashboardStats,
  exportEventParticipantsCSV,
  getEventRegistrations,
  getAllOrganizerRegistrations
} = require('../controllers/organizerDashboardController');
const { verifyOrganizerToken } = require('../middleware/organizerAuthMiddleware');

// Protect all organizer dashboard endpoints with Organizer Middleware
router.use(verifyOrganizerToken);

// Dashboard Routes
router.get('/dashboard', getOrganizerDashboardSummary);
router.get('/passes-list', getAllOrganizerRegistrations);
router.get('/events/:eventId/dashboard', getEventDashboardStats);
router.get('/events/:eventId/export', exportEventParticipantsCSV);
router.get('/events/:eventId/registrations', getEventRegistrations);

module.exports = router;
