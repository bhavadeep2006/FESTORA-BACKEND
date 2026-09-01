const express = require('express');
const router = express.Router();
const {
  submitHostRequest,
  getHostRequests,
  getHostRequestById,
  updateHostRequestStatus,
  approveHostRequest,
  rejectHostRequest
} = require('../controllers/hostRequestController');
const { verifyOrganizerToken } = require('../middleware/organizerAuthMiddleware');

// Public route: Submit Host Event Request (No JWT required)
router.post('/', submitHostRequest);

// Protected routes: Authorized staff/organizers only
router.get('/', verifyOrganizerToken, getHostRequests);
router.get('/:id', verifyOrganizerToken, getHostRequestById);
router.post('/:id/approve', verifyOrganizerToken, approveHostRequest);
router.post('/:id/reject', verifyOrganizerToken, rejectHostRequest);
router.patch('/:id/status', verifyOrganizerToken, updateHostRequestStatus);
router.put('/:id/status', verifyOrganizerToken, updateHostRequestStatus);

module.exports = router;
