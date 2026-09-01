const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');

// Organizer Login
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: 'Email and password are required.'
      });
    }

    // Query organizer by email
    const [rows] = await pool.query(
      'SELECT * FROM organizers WHERE email = ?',
      [email.toLowerCase().trim()]
    );

    console.log('[ORGANIZER LOGIN]');
    console.log('email received:', email.toLowerCase().trim());
    console.log('organizer found:', rows.length > 0 ? 'YES' : 'NO');

    if (rows.length === 0) {
      return res.status(401).json({
        message: 'Invalid email or password.'
      });
    }

    const organizer = rows[0];

    // Compare bcrypt password hash
    const isPasswordValid = await bcrypt.compare(password, organizer.password_hash);
    console.log('password comparison:', isPasswordValid ? 'MATCH' : 'NO MATCH');

    if (!isPasswordValid) {
      return res.status(401).json({
        message: 'Invalid email or password.'
      });
    }

    // Generate JWT token with role: 'organizer'
    const tokenPayload = {
      id: organizer.id,
      email: organizer.email,
      role: 'organizer'
    };

    const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, {
      expiresIn: '24h'
    });

    return res.status(200).json({
      message: 'Organizer login successful',
      token,
      organizer: {
        id: organizer.id,
        name: organizer.name,
        email: organizer.email,
        organization_name: organizer.organization_name
      }
    });

  } catch (error) {
    console.error('Organizer Login Error:', error);
    return res.status(500).json({
      message: 'Server error during organizer login. Please try again later.'
    });
  }
};

// Protected Get Organizer Profile
const getMe = async (req, res) => {
  return res.status(200).json({
    organizer: {
      id: req.organizer.id,
      name: req.organizer.name,
      email: req.organizer.email,
      organization_name: req.organizer.organization_name,
      phone: req.organizer.phone,
      created_at: req.organizer.created_at,
      updated_at: req.organizer.updated_at
    }
  });
};

module.exports = {
  login,
  getMe
};
