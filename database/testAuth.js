const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config();

const BASE_URL = 'http://localhost:5000';

async function runAuthTests() {
  console.log('--- STARTING STUDENT AUTHENTICATION TESTS ---\n');

  const testStudent = {
    full_name: "Test Student",
    email: "test.student@example.com",
    phone: "9876543210",
    password: "Password123!",
    college: "Festora Engineering College",
    year_of_study: "3rd Year",
    department: "Computer Science"
  };

  let token = null;

  // 1. REGISTER STUDENT
  console.log('1. Testing Registration (POST /api/auth/register)...');
  const regRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(testStudent)
  });
  const regData = await regRes.json();
  console.log(`   Status: ${regRes.status}`);
  console.log(`   Response:`, JSON.stringify(regData));
  if (regRes.status !== 201 || regData.user.password_hash) {
    throw new Error('Registration test failed or password_hash leaked!');
  }
  console.log('   [SUCCESS] Student registered cleanly without password_hash exposure.\n');

  // 2. DUPLICATE EMAIL REGISTRATION
  console.log('2. Testing Duplicate Registration (POST /api/auth/register)...');
  const dupRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(testStudent)
  });
  const dupData = await dupRes.json();
  console.log(`   Status: ${dupRes.status}`);
  console.log(`   Response:`, JSON.stringify(dupData));
  if (dupRes.status !== 409) {
    throw new Error('Duplicate registration test failed!');
  }
  console.log('   [SUCCESS] Duplicate email correctly rejected with status 409.\n');

  // 3. INVALID LOGIN (WRONG PASSWORD)
  console.log('3. Testing Invalid Login (POST /api/auth/login)...');
  const invalidLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testStudent.email, password: "WrongPassword" })
  });
  const invalidLoginData = await invalidLoginRes.json();
  console.log(`   Status: ${invalidLoginRes.status}`);
  console.log(`   Response:`, JSON.stringify(invalidLoginData));
  if (invalidLoginRes.status !== 401) {
    throw new Error('Invalid login test failed!');
  }
  console.log('   [SUCCESS] Invalid password rejected with status 401.\n');

  // 4. VALID LOGIN
  console.log('4. Testing Valid Login (POST /api/auth/login)...');
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testStudent.email, password: testStudent.password })
  });
  const loginData = await loginRes.json();
  console.log(`   Status: ${loginRes.status}`);
  console.log(`   Response:`, JSON.stringify(loginData));
  if (loginRes.status !== 200 || !loginData.token || loginData.user.password_hash) {
    throw new Error('Valid login test failed or JWT token missing!');
  }
  token = loginData.token;
  console.log('   [SUCCESS] Login successful, JWT token issued, no password_hash exposed.\n');

  // 5. PROTECTED ROUTE WITH TOKEN (/api/auth/me)
  console.log('5. Testing Protected Route GET /api/auth/me (With Bearer Token)...');
  const meRes = await fetch(`${BASE_URL}/api/auth/me`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  const meData = await meRes.json();
  console.log(`   Status: ${meRes.status}`);
  console.log(`   Response:`, JSON.stringify(meData));
  if (meRes.status !== 200 || meData.user.email !== testStudent.email) {
    throw new Error('Protected route test failed!');
  }
  console.log('   [SUCCESS] /api/auth/me returned current user profile.\n');

  // 6. PROTECTED ROUTE WITHOUT TOKEN
  console.log('6. Testing Protected Route GET /api/auth/me (Without Token)...');
  const noTokenRes = await fetch(`${BASE_URL}/api/auth/me`, {
    method: 'GET'
  });
  const noTokenData = await noTokenRes.json();
  console.log(`   Status: ${noTokenRes.status}`);
  console.log(`   Response:`, JSON.stringify(noTokenData));
  if (noTokenRes.status !== 401) {
    throw new Error('Unauthenticated /me test failed!');
  }
  console.log('   [SUCCESS] Request without token rejected with status 401.\n');

  // 7. DIRECT DATABASE VERIFICATION
  console.log('7. Direct MySQL Database Verification...');
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'root',
    database: process.env.DB_NAME || 'festora'
  });

  const [rows] = await connection.query('SELECT * FROM users WHERE email = ?', [testStudent.email]);
  console.log(`   Found ${rows.length} row in users table for email: ${testStudent.email}`);
  const dbUser = rows[0];
  console.log(`   ID: ${dbUser.id}`);
  console.log(`   Email: ${dbUser.email}`);
  console.log(`   Password Hash in DB: ${dbUser.password_hash}`);
  const isBcrypt = dbUser.password_hash.startsWith('$2a$') || dbUser.password_hash.startsWith('$2b$');
  console.log(`   Is Valid bcrypt Hash: ${isBcrypt}`);

  if (!isBcrypt) {
    throw new Error('Password in DB is not hashed with bcrypt!');
  }

  // CLEANUP TEST ACCOUNT
  console.log('\n8. Cleaning up test account from database...');
  await connection.query('DELETE FROM users WHERE email = ?', [testStudent.email]);
  console.log('   Test student account removed from DB.');
  await connection.end();

  console.log('\n--- ALL AUTHENTICATION TESTS PASSED SUCCESSFULLY! ---');
}

runAuthTests().catch(err => {
  console.error('\nTEST FAILURE:', err);
  process.exit(1);
});
