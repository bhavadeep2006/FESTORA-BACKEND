const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');

dotenv.config();

const BASE_URL = 'http://localhost:5000';

async function runForgotPasswordTests() {
  console.log('--- STARTING FORGOT PASSWORD & GOOGLE OAUTH TESTS ---\n');

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'root',
    database: process.env.DB_NAME || 'festora'
  });

  const oldPassword = 'OldPassword123!';
  const newPassword = 'NewPassword123!';
  const testEmail = 'student.forgot@festora.com';
  const passHash = await bcrypt.hash(oldPassword, 10);

  // Seed Student
  const [s] = await connection.query(
    'INSERT INTO users (full_name, email, phone, password_hash, college, year_of_study, department) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ['Forgot Student', testEmail, '9876547001', passHash, 'Forgot College', '3rd Year', 'CS']
  );
  const studentId = s.insertId;

  console.log('1. Test student created in MySQL DB.');

  // TEST 1: EXISTING EMAIL FORGOT PASSWORD
  console.log('2. Testing POST /api/auth/forgot-password with Existing Email...');
  const forgotRes = await fetch(`${BASE_URL}/api/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testEmail })
  });
  const forgotData = await forgotRes.json();
  console.log(`   Status: ${forgotRes.status}`);
  console.log(`   Response:`, JSON.stringify(forgotData));

  if (forgotRes.status !== 200 || !forgotData.message.includes('If the account exists')) {
    throw new Error('Forgot password response failed generic message test!');
  }

  const rawToken = forgotData.dev_reset_token;
  console.log(`   Dev Reset Token Generated: ${rawToken}`);

  const [dbUserRows] = await connection.query('SELECT reset_token_hash, reset_token_expires_at FROM users WHERE id = ?', [studentId]);
  console.log(`   MySQL reset_token_hash populated: ${dbUserRows[0].reset_token_hash ? 'Yes' : 'No'}`);
  if (!dbUserRows[0].reset_token_hash) {
    throw new Error('reset_token_hash was not populated in MySQL!');
  }
  console.log('   [SUCCESS] Generic response returned & hashed token saved in MySQL.\n');

  // TEST 2: NON-EXISTING EMAIL
  console.log('3. Testing POST /api/auth/forgot-password with Non-Existing Email...');
  const nonExistRes = await fetch(`${BASE_URL}/api/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'nonexistent999@test.com' })
  });
  const nonExistData = await nonExistRes.json();
  console.log(`   Status: ${nonExistRes.status}`);
  console.log(`   Response:`, JSON.stringify(nonExistData));

  if (nonExistData.message !== forgotData.message) {
    throw new Error('Account enumeration flaw detected! Response differs for non-existing email.');
  }
  console.log('   [SUCCESS] Account enumeration prevented. Same generic message returned for non-existing email.\n');

  // TEST 3: INVALID RESET TOKEN
  console.log('4. Testing POST /api/auth/reset-password with Invalid Token...');
  const invalidResetRes = await fetch(`${BASE_URL}/api/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: 'INVALID_TOKEN_99999', new_password: newPassword })
  });
  console.log(`   Status: ${invalidResetRes.status}`);
  if (invalidResetRes.status !== 400) {
    throw new Error('Invalid reset token was not rejected!');
  }
  console.log('   [SUCCESS] Invalid reset token rejected with 400 Bad Request.\n');

  // TEST 4: EXPIRED RESET TOKEN
  console.log('5. Testing POST /api/auth/reset-password with Expired Token...');
  await connection.query('UPDATE users SET reset_token_expires_at = NOW() - INTERVAL 1 HOUR WHERE id = ?', [studentId]);

  const expiredResetRes = await fetch(`${BASE_URL}/api/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: rawToken, new_password: newPassword })
  });
  console.log(`   Status: ${expiredResetRes.status}`);
  if (expiredResetRes.status !== 400) {
    throw new Error('Expired reset token was not rejected!');
  }
  console.log('   [SUCCESS] Expired reset token rejected with 400 Bad Request.\n');

  // TEST 5: SUCCESSFUL PASSWORD RESET
  console.log('6. Testing Successful Password Reset (Valid Token)...');
  await connection.query('UPDATE users SET reset_token_expires_at = NOW() + INTERVAL 20 MINUTE WHERE id = ?', [studentId]);

  const successResetRes = await fetch(`${BASE_URL}/api/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: rawToken, new_password: newPassword })
  });
  const successResetData = await successResetRes.json();
  console.log(`   Status: ${successResetRes.status}`);
  console.log(`   Response:`, JSON.stringify(successResetData));

  if (successResetRes.status !== 200) {
    throw new Error('Password reset failed for valid token!');
  }

  // Verify single-use token invalidation in DB
  const [clearedUserRows] = await connection.query('SELECT reset_token_hash, reset_token_expires_at FROM users WHERE id = ?', [studentId]);
  console.log(`   MySQL token cleared (single-use): hash=${clearedUserRows[0].reset_token_hash}, expires=${clearedUserRows[0].reset_token_expires_at}`);

  if (clearedUserRows[0].reset_token_hash !== null) {
    throw new Error('Reset token hash was not set to NULL after reset!');
  }
  console.log('   [SUCCESS] Password updated in MySQL and reset token invalidated (single-use).\n');

  // TEST 6: REUSED TOKEN REJECTION
  console.log('7. Testing Reused Token Rejection...');
  const reuseResetRes = await fetch(`${BASE_URL}/api/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: rawToken, new_password: 'AnotherPassword123!' })
  });
  console.log(`   Status: ${reuseResetRes.status}`);
  if (reuseResetRes.status !== 400) {
    throw new Error('Reused reset token was not rejected!');
  }
  console.log('   [SUCCESS] Reused reset token rejected with 400 Bad Request.\n');

  // TEST 7: LOGIN WITH NEW PASSWORD
  console.log('8. Testing Student Login with Old vs New Password...');
  const oldLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testEmail, password: oldPassword })
  });
  console.log(`   Old Password Login Status: ${oldLoginRes.status}`);

  const newLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testEmail, password: newPassword })
  });
  const newLoginData = await newLoginRes.json();
  console.log(`   New Password Login Status: ${newLoginRes.status}`);

  if (oldLoginRes.status !== 401 || newLoginRes.status !== 200 || !newLoginData.token) {
    throw new Error('Login with new password failed!');
  }
  console.log('   [SUCCESS] Old password rejected (401), new password accepted (200 OK) with JWT token.\n');

  // TEST 8: GOOGLE OAUTH ROUTE CHECK
  console.log('9. Testing GET /api/auth/google (Unconfigured Credentials Check)...');
  const googleRes = await fetch(`${BASE_URL}/api/auth/google`);
  const googleData = await googleRes.json();
  console.log(`   Status: ${googleRes.status}`);
  console.log(`   Response:`, JSON.stringify(googleData));

  if (googleRes.status !== 200 || !googleData.message.includes('Google OAuth is not configured yet')) {
    throw new Error('Google OAuth unconfigured route check failed!');
  }
  console.log('   [SUCCESS] Google OAuth endpoint responds safely when credentials are unconfigured in .env.\n');

  // CLEANUP
  console.log('10. Cleaning up test data from MySQL DB...');
  await connection.query('DELETE FROM users WHERE id = ?', [studentId]);
  await connection.end();
  console.log('    Database cleaned. 0 test records remain.\n');

  console.log('--- ALL FORGOT PASSWORD & GOOGLE OAUTH TESTS PASSED SUCCESSFULLY! ---');
}

runForgotPasswordTests().catch(err => {
  console.error('\nTEST FAILURE:', err);
  process.exit(1);
});
