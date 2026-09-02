const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { pool } = require('./db');

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
const getCallbackURL = () => {
  if (process.env.GOOGLE_CALLBACK_URL && !process.env.GOOGLE_CALLBACK_URL.includes('localhost')) {
    return process.env.GOOGLE_CALLBACK_URL;
  }
  if (process.env.NODE_ENV === 'production' || process.env.RENDER) {
    return 'https://festora-backend.onrender.com/api/auth/google/callback';
  }
  return process.env.GOOGLE_CALLBACK_URL || 'http://localhost:5000/api/auth/google/callback';
};

const callbackURL = getCallbackURL();

if (clientId && clientSecret) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: clientId,
        clientSecret: clientSecret,
        callbackURL: callbackURL
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const googleId = profile.id;
          const email = profile.emails && profile.emails[0] ? profile.emails[0].value.toLowerCase().trim() : null;
          const fullName = profile.displayName || `${profile.name?.givenName || ''} ${profile.name?.familyName || ''}`.trim() || 'Google User';
          const avatarUrl = profile.photos && profile.photos[0] ? profile.photos[0].value : null;

          if (!email) {
            return done(new Error('No verified email returned from Google OAuth'), null);
          }

          // 1. Check by google_id
          const [byGoogleId] = await pool.query('SELECT * FROM users WHERE google_id = ?', [googleId]);
          if (byGoogleId.length > 0) {
            if (avatarUrl && byGoogleId[0].avatar_url !== avatarUrl) {
              await pool.query('UPDATE users SET avatar_url = ? WHERE id = ?', [avatarUrl, byGoogleId[0].id]);
              byGoogleId[0].avatar_url = avatarUrl;
            }
            return done(null, byGoogleId[0]);
          }

          // 2. Check by email (Account Linking)
          const [byEmail] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
          if (byEmail.length > 0) {
            const existingUser = byEmail[0];
            await pool.query(
              'UPDATE users SET google_id = ?, avatar_url = COALESCE(avatar_url, ?) WHERE id = ?',
              [googleId, avatarUrl, existingUser.id]
            );
            existingUser.google_id = googleId;
            if (!existingUser.avatar_url) existingUser.avatar_url = avatarUrl;
            return done(null, existingUser);
          }

          // 3. Create new student user if account does not exist
          const dummyPassword = crypto.randomBytes(16).toString('hex');
          const password_hash = await bcrypt.hash(dummyPassword, 10);

          const [result] = await pool.query(
            `INSERT INTO users (full_name, email, google_id, auth_provider, phone, password_hash, college, year_of_study, department, avatar_url)
             VALUES (?, ?, ?, 'google', ?, ?, ?, ?, ?, ?)`,
            [fullName, email, googleId, '', password_hash, 'Google User', 'Student', 'General', avatarUrl]
          );

          const [newUserRows] = await pool.query('SELECT * FROM users WHERE id = ?', [result.insertId]);
          return done(null, newUserRows[0]);

        } catch (error) {
          console.error('Google Strategy Error:', error);
          return done(error, null);
        }
      }
    )
  );
}

module.exports = passport;
