const express = require('express');
const router = express.Router();
const {
  getOrganizerNotifications,
  markNotificationRead,
  markAllNotificationsRead
} = require('../controllers/notificationController');
const { verifyOrganizerToken } = require('../middleware/organizerAuthMiddleware');

// Protected organizer notification endpoints
router.get('/', verifyOrganizerToken, getOrganizerNotifications);
router.put('/read-all', verifyOrganizerToken, markAllNotificationsRead);
router.put('/:id/read', verifyOrganizerToken, markNotificationRead);

module.exports = router;
