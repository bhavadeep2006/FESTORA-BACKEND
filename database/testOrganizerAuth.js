const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');

dotenv.config();

const BASE_URL = 'http://localhost:5000';

async function runOrganizerAuthTests() {
  console.log('--- STARTING ORGANIZER AUTHENTICATION TESTS ---\n');

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'root',
    database: process.env.DB_NAME || 'festora'
  });

  const testOrganizer = {
    name: "TechFest Admin",
    email: "organizer.test@festora.com",
    phone: "9123456789",
    password: "OrganizerPassword123!",
    organization_name: "TechFest Association"
  };

  const testStudent = {
    full_name: "Student Test User",
    email: "student.test@festora.com",
    phone: "9876543210",
    password: "StudentPassword123!",
    college: "Test College",
    year_of_study: "4th Year",
    department: "ECE"
  };

  // Seed test organizer into DB securely
  const orgHash = await bcrypt.hash(testOrganizer.password, 10);
  await connection.query(
    'INSERT INTO organizers (name, email, phone, password_hash, organization_name) VALUES (?, ?, ?, ?, ?)',
    [testOrganizer.name, testOrganizer.email, testOrganizer.phone, orgHash, testOrganizer.organization_name]
  );
  console.log('1. Development Test Organizer created in MySQL DB.');

  // Register student to get student JWT
  const studentRegRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(testStudent)
  });
  const studentLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testStudent.email, password: testStudent.password })
  });
  const studentLoginData = await studentLoginRes.json();
  const studentToken = studentLoginData.token;
  console.log('2. Test Student created and Student JWT obtained.\n');

  let organizerToken = null;

  // TEST 1: ORGANIZER LOGIN VALID CREDENTIALS
  console.log('3. Testing Organizer Login with Valid Credentials (POST /api/organizer/login)...');
  const orgLoginRes = await fetch(`${BASE_URL}/api/organizer/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testOrganizer.email, password: testOrganizer.password })
  });
  const orgLoginData = await orgLoginRes.json();
  console.log(`   Status: ${orgLoginRes.status}`);
  console.log(`   Response:`, JSON.stringify(orgLoginData));

  if (orgLoginRes.status !== 200 || !orgLoginData.token || orgLoginData.organizer.password_hash) {
    throw new Error('Organizer login failed or password_hash leaked!');
  }
  organizerToken = orgLoginData.token;
  console.log('   [SUCCESS] Organizer logged in, JWT token issued, no password_hash exposed.\n');

  // TEST 2: ORGANIZER LOGIN INVALID CREDENTIALS
  console.log('4. Testing Organizer Login with Invalid Credentials...');
  const invalidRes = await fetch(`${BASE_URL}/api/organizer/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testOrganizer.email, password: "WrongPassword" })
  });
  const invalidData = await invalidRes.json();
  console.log(`   Status: ${invalidRes.status}`);
  console.log(`   Response:`, JSON.stringify(invalidData));
  if (invalidRes.status !== 401) {
    throw new Error('Invalid organizer login test failed!');
  }
  console.log('   [SUCCESS] Invalid password rejected with 401 Unauthorized.\n');

  // TEST 3: GET /api/organizer/me WITH ORGANIZER JWT
  console.log('5. Testing GET /api/organizer/me (With Organizer Bearer Token)...');
  const meRes = await fetch(`${BASE_URL}/api/organizer/me`, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${organizerToken}` }
  });
  const meData = await meRes.json();
  console.log(`   Status: ${meRes.status}`);
  console.log(`   Response:`, JSON.stringify(meData));
  if (meRes.status !== 200 || meData.organizer.email !== testOrganizer.email) {
    throw new Error('Protected organizer profile route failed!');
  }
  console.log('   [SUCCESS] GET /api/organizer/me returned organizer profile.\n');

  // TEST 4: GET /api/organizer/me WITHOUT TOKEN
  console.log('6. Testing GET /api/organizer/me (Without Token)...');
  const noTokenRes = await fetch(`${BASE_URL}/api/organizer/me`, { method: 'GET' });
  const noTokenData = await noTokenRes.json();
  console.log(`   Status: ${noTokenRes.status}`);
  console.log(`   Response:`, JSON.stringify(noTokenData));
  if (noTokenRes.status !== 401) {
    throw new Error('Missing token test failed!');
  }
  console.log('   [SUCCESS] Request without token rejected with 401 Unauthorized.\n');

  // TEST 5: GET /api/organizer/me WITH STUDENT TOKEN (CROSS-ROLE REJECTION)
  console.log('7. Testing GET /api/organizer/me (Using Student JWT Token)...');
  const studentTokenRes = await fetch(`${BASE_URL}/api/organizer/me`, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${studentToken}` }
  });
  const studentTokenData = await studentTokenRes.json();
  console.log(`   Status: ${studentTokenRes.status}`);
  console.log(`   Response:`, JSON.stringify(studentTokenData));
  if (studentTokenRes.status !== 403) {
    throw new Error('Student token was NOT rejected on organizer route!');
  }
  console.log('   [SUCCESS] Student token rejected with HTTP 403 Forbidden on organizer route!\n');

  // CLEANUP TEST ACCOUNTS
  console.log('8. Cleaning up test accounts from DB...');
  await connection.query('DELETE FROM organizers WHERE email = ?', [testOrganizer.email]);
  await connection.query('DELETE FROM users WHERE email = ?', [testStudent.email]);
  console.log('   Test accounts purged. DB remains clean.');

  await connection.end();
  console.log('\n--- ALL ORGANIZER AUTHENTICATION TESTS PASSED SUCCESSFULLY! ---');
}

runOrganizerAuthTests().catch(err => {
  console.error('\nTEST FAILURE:', err);
  process.exit(1);
});
