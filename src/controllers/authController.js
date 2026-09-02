const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { pool } = require('../config/db');
const { sendPasswordResetEmail, sendOtpEmail } = require('../services/emailService');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Student Registration
const register = async (req, res) => {
  try {
    const { full_name, email, phone, password, college, year_of_study, department } = req.body;

    console.log('[REGISTRATION] Register attempt initiated for email domain:', email ? email.split('@')[1] : 'none');

    if (!full_name || !email || !phone || !password || !college || !year_of_study || !department) {
      console.warn('[REGISTRATION] Missing required fields in request');
      return res.status(400).json({
        message: 'All fields (full_name, email, phone, password, college, year_of_study, department) are required.'
      });
    }

    if (!EMAIL_REGEX.test(email)) {
      return res.status(400).json({
        message: 'Please provide a valid email address.'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        message: 'Password must be at least 6 characters long.'
      });
    }

    const cleanEmail = email.toLowerCase().trim();
    console.log('[REGISTRATION] Checking existing email in database...');
    const [existingUsers] = await pool.query(
      'SELECT id FROM users WHERE email = ?',
      [cleanEmail]
    );

    if (existingUsers.length > 0) {
      console.log('[REGISTRATION] Email already exists in database');
      return res.status(409).json({
        message: 'Email is already registered.'
      });
    }

    const saltRounds = 10;
    const password_hash = await bcrypt.hash(password, saltRounds);

    console.log('[REGISTRATION] Executing INSERT into users table...');
    const [result] = await pool.query(
      `INSERT INTO users (full_name, email, phone, password_hash, college, year_of_study, department)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        full_name.trim(),
        cleanEmail,
        phone.trim(),
        password_hash,
        college.trim(),
        year_of_study.trim(),
        department.trim()
      ]
    );

    const newUserId = result.insertId;
    console.log('[REGISTRATION] User record inserted successfully, ID:', newUserId);

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    console.log('[REGISTRATION] Updating reset token for OTP verification...');
    await pool.query(
      'UPDATE users SET reset_token_hash = ?, reset_token_expires_at = ? WHERE id = ?',
      [otp, expiresAt, newUserId]
    );

    console.log('[REGISTRATION] Dispatching OTP email...');
    const emailRes = await sendOtpEmail({
      toEmail: cleanEmail,
      studentName: full_name.trim(),
      otp: otp
    });

    if (!emailRes.sent) {
      console.error('[REGISTRATION] OTP email delivery failed:', emailRes.error || emailRes.reason);
      const isUnconfigured = emailRes.reason === 'unconfigured';
      const errorMsg = isUnconfigured
        ? 'Failed to send OTP verification email. Server SMTP credentials (EMAIL_USER / EMAIL_PASSWORD) are not configured.'
        : `Failed to send OTP verification email. ${emailRes.error || 'Please check SMTP settings.'}`;

      return res.status(500).json({
        message: errorMsg,
        db_user_created: true,
        email_sent: false,
        error_code: emailRes.code || (isUnconfigured ? 'SMTP_UNCONFIGURED' : 'EMAIL_DISPATCH_FAILED')
      });
    }

    console.log('[REGISTRATION] Registration flow completed successfully for user ID:', newUserId);

    return res.status(201).json({
      message: 'Student registered successfully. Verification code sent to email.',
      user: {
        id: newUserId,
        full_name: full_name.trim(),
        email: cleanEmail,
        phone: phone.trim(),
        college: college.trim(),
        year_of_study: year_of_study.trim(),
        department: department.trim()
      }
    });

  } catch (error) {
    console.error('[REGISTRATION ERROR] Code:', error.code, 'Errno:', error.errno, 'SqlState:', error.sqlState, 'Message:', error.message);
    return res.status(500).json({
      message: 'Server error during registration. Please try again later.'
    });
  }
};

// Student Login
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: 'Email and password are required.'
      });
    }

    const [rows] = await pool.query(
      'SELECT * FROM users WHERE email = ?',
      [email.toLowerCase().trim()]
    );

    if (rows.length === 0) {
      return res.status(401).json({
        message: 'Invalid email or password.'
      });
    }

    const user = rows[0];

    const isPasswordValid = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordValid) {
      return res.status(401).json({
        message: 'Invalid email or password.'
      });
    }

    const tokenPayload = {
      id: user.id,
      email: user.email,
      role: 'student'
    };

    const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, {
      expiresIn: '24h'
    });

    return res.status(200).json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        phone: user.phone,
        college: user.college,
        year_of_study: user.year_of_study,
        department: user.department
      }
    });

  } catch (error) {
    console.error('Login Error:', error);
    return res.status(500).json({
      message: 'Server error during login. Please try again later.'
    });
  }
};

// POST /api/auth/verify-otp
const verifyOtp = async (req, res) => {
  try {
    console.log('[OTP] verify controller reached');
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({
        message: 'Email and OTP code are required.'
      });
    }

    const [rows] = await pool.query(
      'SELECT * FROM users WHERE email = ?',
      [email.toLowerCase().trim()]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        message: 'User account not found.'
      });
    }

    const user = rows[0];

    if (!user.reset_token_hash || user.reset_token_hash !== otp.toString().trim()) {
      return res.status(400).json({
        message: 'Invalid verification code.'
      });
    }

    if (new Date(user.reset_token_expires_at) < new Date()) {
      return res.status(400).json({
        message: 'Verification code has expired. Please request a new code.'
      });
    }

    await pool.query(
      'UPDATE users SET reset_token_hash = NULL, reset_token_expires_at = NULL WHERE id = ?',
      [user.id]
    );

    const tokenPayload = {
      id: user.id,
      email: user.email,
      role: 'student'
    };

    const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, {
      expiresIn: '24h'
    });

    return res.status(200).json({
      message: 'Email verified successfully.',
      token,
      user: {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        phone: user.phone,
        college: user.college,
        year_of_study: user.year_of_study,
        department: user.department
      }
    });

  } catch (error) {
    console.error('Verify OTP Error:', error);
    return res.status(500).json({
      message: 'Server error during OTP verification.'
    });
  }
};

// POST /api/auth/resend-otp
const resendOtp = async (req, res) => {
  try {
    console.log('[OTP] resend controller reached');
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        message: 'Email address is required.'
      });
    }

    const [rows] = await pool.query(
      'SELECT * FROM users WHERE email = ?',
      [email.toLowerCase().trim()]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        message: 'No pending registration found for this email.'
      });
    }

    const user = rows[0];

    console.log('[OTP] pending signup found');

    const newOtp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await pool.query(
      'UPDATE users SET reset_token_hash = ?, reset_token_expires_at = ? WHERE id = ?',
      [newOtp, expiresAt, user.id]
    );

    console.log('[OTP] Resend email service called...');
    const emailRes = await sendOtpEmail({
      toEmail: user.email.toLowerCase().trim(),
      studentName: user.full_name.trim(),
      otp: newOtp
    });

    if (!emailRes.sent) {
      console.error('[OTP] Resend email dispatch failed:', emailRes.error || emailRes.reason);
      return res.status(500).json({
        message: `Failed to send OTP verification email. ${emailRes.error || (emailRes.reason === 'unconfigured' ? 'SMTP credentials not configured on server.' : 'Please check SMTP settings.')}`,
        email_sent: false,
        error_code: emailRes.code || 'RESEND_EMAIL_FAILED'
      });
    }

    console.log('[OTP] sendMail succeeded for resend');

    return res.status(200).json({
      message: 'A new verification code has been sent to your email.'
    });

  } catch (error) {
    console.error('Resend OTP Error:', error);
    return res.status(500).json({
      message: 'Server error during OTP resend.'
    });
  }
};

const getMe = async (req, res) => {
  return res.status(200).json({
    user: req.user
  });
};

const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const genericResponse = { message: 'If the account exists, a password reset email has been sent.' };
    if (!email || !EMAIL_REGEX.test(email)) return res.status(200).json(genericResponse);

    const cleanEmail = email.toLowerCase().trim();
    const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [cleanEmail]);
    if (rows.length === 0) return res.status(200).json(genericResponse);

    const user = rows[0];
    const rawResetToken = crypto.randomBytes(32).toString('hex');
    const hashedResetToken = crypto.createHash('sha256').update(rawResetToken).digest('hex');
    const expiresAt = new Date(Date.now() + 20 * 60 * 1000);

    await pool.query(
      'UPDATE users SET reset_token_hash = ?, reset_token_expires_at = ? WHERE id = ?',
      [hashedResetToken, expiresAt, user.id]
    );

    const emailResult = await sendPasswordResetEmail({
      toEmail: user.email,
      studentName: user.full_name,
      resetToken: rawResetToken
    });

    if (emailResult.reason === 'unconfigured') {
      return res.status(200).json({
        ...genericResponse,
        dev_note: 'SMTP unconfigured. Use dev_reset_token for testing.',
        dev_reset_token: rawResetToken
      });
    }

    return res.status(200).json(genericResponse);
  } catch (error) {
    console.error('Forgot Password Error:', error);
    return res.status(500).json({ message: 'Server error during password reset request.' });
  }
};

const resetPassword = async (req, res) => {
  try {
    const { token, new_password } = req.body;
    if (!token || !new_password) return res.status(400).json({ message: 'Token and new_password are required.' });
    if (new_password.length < 6) return res.status(400).json({ message: 'Password must be at least 6 characters long.' });

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    const [rows] = await pool.query('SELECT * FROM users WHERE reset_token_hash = ? AND reset_token_expires_at > NOW()', [hashedToken]);
    if (rows.length === 0) return res.status(400).json({ message: 'Invalid or expired password reset token.' });

    const user = rows[0];
    const newPasswordHash = await bcrypt.hash(new_password, 10);

    await pool.query(
      'UPDATE users SET password_hash = ?, reset_token_hash = NULL, reset_token_expires_at = NULL WHERE id = ?',
      [newPasswordHash, user.id]
    );

    return res.status(200).json({ message: 'Password has been reset successfully.' });
  } catch (error) {
    console.error('Reset Password Error:', error);
    return res.status(500).json({ message: 'Server error during password reset.' });
  }
};

const googleAuth = (req, res, next) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    return res.redirect(`${frontendUrl}/signin?error=google_not_configured`);
  }
  const passport = require('../config/passport');
  passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
};

const googleCallback = async (req, res, next) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

  if (!clientId || !clientSecret) {
    return res.redirect(`${frontendUrl}/signin?error=google_not_configured`);
  }
  const passport = require('../config/passport');
  passport.authenticate('google', { session: false }, async (err, user) => {
    if (err || !user) {
      return res.redirect(`${frontendUrl}/signin?error=google_auth_failed`);
    }
    try {
      const tokenPayload = { id: user.id, email: user.email, role: 'student' };
      const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, { expiresIn: '24h' });
      return res.redirect(`${frontendUrl}/auth-success?token=${token}`);
    } catch (tokenErr) {
      return res.redirect(`${frontendUrl}/signin?error=token_error`);
    }
  })(req, res, next);
};

const googleVerifyToken = async (req, res) => {
  try {
    const { id_token, credential } = req.body;
    const tokenToVerify = id_token || credential;

    if (!tokenToVerify) {
      return res.status(400).json({ message: 'Google credential / id_token is required.' });
    }

    const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(tokenToVerify)}`);
    if (!response.ok) {
      return res.status(401).json({ message: 'Invalid or expired Google token.' });
    }

    const payload = await response.json();
    const googleId = payload.sub;
    const email = payload.email ? payload.email.toLowerCase().trim() : null;
    const emailVerified = payload.email_verified === 'true' || payload.email_verified === true;
    const fullName = payload.name || `${payload.given_name || ''} ${payload.family_name || ''}`.trim() || 'Google User';
    const avatarUrl = payload.picture || null;

    if (!email || !emailVerified) {
      return res.status(401).json({ message: 'Unverified or missing email address from Google account.' });
    }

    // 1. Check by google_id
    let [users] = await pool.query('SELECT * FROM users WHERE google_id = ?', [googleId]);
    let user = users[0];

    if (!user) {
      // 2. Check by email (Account Linking)
      const [emailUsers] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
      if (emailUsers.length > 0) {
        user = emailUsers[0];
        await pool.query(
          'UPDATE users SET google_id = ?, avatar_url = COALESCE(avatar_url, ?) WHERE id = ?',
          [googleId, avatarUrl, user.id]
        );
        user.google_id = googleId;
        if (!user.avatar_url) user.avatar_url = avatarUrl;
      } else {
        // 3. Create new user
        const bcrypt = require('bcryptjs');
        const crypto = require('crypto');
        const dummyPassword = crypto.randomBytes(16).toString('hex');
        const password_hash = await bcrypt.hash(dummyPassword, 10);

        const [result] = await pool.query(
          `INSERT INTO users (full_name, email, google_id, auth_provider, phone, password_hash, college, year_of_study, department, avatar_url)
           VALUES (?, ?, ?, 'google', ?, ?, ?, ?, ?, ?)`,
          [fullName, email, googleId, '', password_hash, 'Google User', 'Student', 'General', avatarUrl]
        );

        const [newUserRows] = await pool.query('SELECT * FROM users WHERE id = ?', [result.insertId]);
        user = newUserRows[0];
      }
    } else {
      if (avatarUrl && user.avatar_url !== avatarUrl) {
        await pool.query('UPDATE users SET avatar_url = ? WHERE id = ?', [avatarUrl, user.id]);
        user.avatar_url = avatarUrl;
      }
    }

    const tokenPayload = { id: user.id, email: user.email, role: 'student' };
    const jwtToken = jwt.sign(tokenPayload, process.env.JWT_SECRET, { expiresIn: '24h' });

    return res.status(200).json({
      message: 'Google login successful',
      token: jwtToken,
      user: {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        phone: user.phone || '',
        college: user.college || '',
        year_of_study: user.year_of_study || '',
        department: user.department || '',
        avatar_url: user.avatar_url || ''
      }
    });

  } catch (error) {
    console.error('Google Verify Token Error:', error);
    return res.status(500).json({ message: 'Server error during Google token verification.' });
  }
};

module.exports = {
  register,
  login,
  verifyOtp,
  resendOtp,
  getMe,
  forgotPassword,
  resetPassword,
  googleAuth,
  googleCallback,
  googleVerifyToken
};
