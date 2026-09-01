const express = require('express');
const router = express.Router();
const { getPublicEvents, getPublicEventById } = require('../controllers/eventController');

// Public Event Routes
router.get('/', getPublicEvents);
router.get('/:id', getPublicEventById);

module.exports = router;
