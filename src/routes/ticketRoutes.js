const express = require('express');
const router = express.Router();
const { getMyTickets, getMyTicketById } = require('../controllers/ticketController');
const { verifyToken } = require('../middleware/authMiddleware');

// Protect ticket endpoints with Student Authentication
router.get('/my-tickets', verifyToken, getMyTickets);
router.get('/my-tickets/:id', verifyToken, getMyTicketById);

module.exports = router;
