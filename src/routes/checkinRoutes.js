const express = require('express');
const router = express.Router();
const {
  processCheckin,
  getEventCheckins,
  getEventRegistrations,
  getEventAttendanceSummary
} = require('../controllers/checkinController');
const { verifyOrganizerToken } = require('../middleware/organizerAuthMiddleware');

// Protect all checkin/organizer event analytics endpoints with Organizer Middleware
router.use(verifyOrganizerToken);

router.post('/:eventId(\\d+)/checkin', processCheckin);
router.get('/:eventId(\\d+)/checkins', getEventCheckins);
router.get('/:eventId(\\d+)/registrations', getEventRegistrations);
router.get('/:eventId(\\d+)/attendance', getEventAttendanceSummary);

module.exports = router;
