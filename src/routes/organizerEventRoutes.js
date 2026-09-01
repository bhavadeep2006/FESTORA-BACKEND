const express = require('express');
const router = express.Router();
const {
  createEvent,
  getOrganizerEvents,
  getOrganizerEventById,
  updateEvent,
  publishEvent,
  deleteEvent
} = require('../controllers/organizerEventController');
const { getAllOrganizerRegistrations } = require('../controllers/organizerDashboardController');
const { verifyOrganizerToken } = require('../middleware/organizerAuthMiddleware');

// Protect all organizer event routes with verifyOrganizerToken
router.use(verifyOrganizerToken);

router.post('/', createEvent);
router.get('/', getOrganizerEvents);
router.get('/all-registrations', getAllOrganizerRegistrations);
router.get('/:id(\\d+)', getOrganizerEventById);
router.put('/:id/publish', publishEvent);
router.put('/:id', updateEvent);
router.delete('/:id', deleteEvent);

module.exports = router;
