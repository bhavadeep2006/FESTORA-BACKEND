const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');

const verifyOrganizerToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || req.headers.Authorization;

    console.log('[ORGANIZER AUTH DEBUG]');
    console.log('authorization header present:', authHeader ? 'YES' : 'NO');
    console.log('bearer token present:', (authHeader && authHeader.startsWith('Bearer ')) ? 'YES' : 'NO');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        message: 'Access denied. No token provided.'
      });
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        message: 'Access denied. Token missing.'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('decoded role:', decoded.role);
    console.log('decoded id:', decoded.id);

    // Verify role claim - reject non-organizers with 403 Forbidden
    if (decoded.role !== 'organizer') {
      console.warn('[ORGANIZER AUTH DEBUG] Rejecting token: role is not organizer');
      return res.status(403).json({
        message: 'Access forbidden. Organizer privileges required.'
      });
    }

    // Fetch organizer from DB to ensure account exists
    const [rows] = await pool.query(
      'SELECT id, name, email, phone, organization_name, created_at, updated_at FROM organizers WHERE id = ?',
      [decoded.id]
    );

    console.log('[ORGANIZER AUTH] organizer found:', rows.length > 0 ? 'YES' : 'NO');

    if (rows.length === 0) {
      return res.status(401).json({
        message: 'Unauthorized. Organizer account no longer exists.'
      });
    }

    req.organizer = rows[0];
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        message: 'Token has expired. Please log in again.'
      });
    }
    return res.status(401).json({
      message: 'Invalid token. Authentication failed.'
    });
  }
};

module.exports = { verifyOrganizerToken };
