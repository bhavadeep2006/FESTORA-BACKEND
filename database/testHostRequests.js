const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');

dotenv.config();

const BASE_URL = 'http://localhost:5000';

async function runHostRequestTests() {
  console.log('--- STARTING HOST REQUEST API TESTS ---\n');

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'root',
    database: process.env.DB_NAME || 'festora'
  });

  const passwordHash = await bcrypt.hash('TestPass123!', 10);

  // Seed organizer & student
  const [org] = await connection.query(
    'INSERT INTO organizers (name, email, phone, password_hash, organization_name) VALUES (?, ?, ?, ?, ?)',
    ['Festora Admin', 'admin.hr@festora.com', '9876543210', passwordHash, 'Festora Operations']
  );
  const orgId = org.insertId;

  const [stu] = await connection.query(
    'INSERT INTO users (full_name, email, phone, password_hash, college, year_of_study, department) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ['Student Visitor', 'student.hr@festora.com', '9876543211', passwordHash, 'IIT Madras', '3rd Year', 'CSE']
  );
  const studentId = stu.insertId;

  // Obtain tokens
  const orgLogin = await fetch(`${BASE_URL}/api/organizer/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin.hr@festora.com', password: 'TestPass123!' })
  }).then(r => r.json());

  const studentLogin = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'student.hr@festora.com', password: 'TestPass123!' })
  }).then(r => r.json());

  const tokenOrg = orgLogin.token;
  const tokenStudent = studentLogin.token;

  console.log('1. Test setup completed & tokens generated.\n');

  // TEST 1: PUBLIC SUBMISSION (NO JWT NEEDED)
  console.log('2. Testing Public Submission (POST /api/host-requests)...');
  const validPayload = {
    name: 'Jane Doe',
    email: 'jane.doe@robotics.org',
    phone: '9988776655',
    college_or_organization: 'Robotics Club',
    event_name: 'National Robotics Championship 2026',
    event_description: 'Annual inter-college robotics competition.',
    preferred_date: '2026-11-20',
    expected_participants: 250,
    additional_message: 'Please contact us for sponsorship details.'
  };

  const submitRes = await fetch(`${BASE_URL}/api/host-requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(validPayload)
  });
  const submitData = await submitRes.json();
  console.log(`   Status: ${submitRes.status}`);
  console.log(`   Response:`, JSON.stringify(submitData));

  if (submitRes.status !== 201 || !submitData.requestId) {
    throw new Error('Public host request submission failed!');
  }
  const requestId = submitData.requestId;
  console.log('   [SUCCESS] Host request submitted publicly without JWT token.\n');

  // TEST 2: VALIDATION REJECTION
  console.log('3. Testing Validation Rejection (Missing event_name)...');
  const invalidRes = await fetch(`${BASE_URL}/api/host-requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Invalid User', email: 'user@test.com', phone: '123' })
  });
  console.log(`   Status: ${invalidRes.status}`);
  if (invalidRes.status !== 400) {
    throw new Error('Validation failed to reject invalid payload!');
  }
  console.log('   [SUCCESS] Missing required fields correctly rejected with 400 Bad Request.\n');

  // TEST 3: VERIFY ZERO SIDE-EFFECTS (NO AUTO EVENT/ORGANIZER CREATION)
  console.log('4. Verifying Zero Side Effects in MySQL...');
  const [eventRows] = await connection.query('SELECT COUNT(*) as count FROM events');
  const [orgRows] = await connection.query('SELECT COUNT(*) as count FROM organizers');
  const [hrRows] = await connection.query('SELECT * FROM host_requests WHERE id = ?', [requestId]);

  console.log(`   Events count: ${eventRows[0].count}`);
  console.log(`   Organizers count: ${orgRows[0].count} (Seeded organizer only)`);
  console.log(`   Host Request Status: ${hrRows[0].status}`);

  if (eventRows[0].count !== 0 || hrRows[0].status !== 'pending') {
    throw new Error('Host request submission created side-effects!');
  }
  console.log('   [SUCCESS] Host request created in pending state. NO events or organizers were auto-created.\n');

  // TEST 4: PROTECTION OF GET /api/host-requests
  console.log('5. Testing GET /api/host-requests (Without Token)...');
  const noTokenRes = await fetch(`${BASE_URL}/api/host-requests`);
  console.log(`   Status: ${noTokenRes.status}`);
  if (noTokenRes.status !== 401) {
    throw new Error('Unauthenticated user accessed private host requests!');
  }
  console.log('   [SUCCESS] Unauthenticated request rejected with 401 Unauthorized.\n');

  console.log('6. Testing GET /api/host-requests (With Student Token)...');
  const studentRes = await fetch(`${BASE_URL}/api/host-requests`, {
    headers: { 'Authorization': `Bearer ${tokenStudent}` }
  });
  console.log(`   Status: ${studentRes.status}`);
  if (studentRes.status !== 403) {
    throw new Error('Student token accessed private host requests!');
  }
  console.log('   [SUCCESS] Student token rejected with 403 Forbidden.\n');

  console.log('7. Testing GET /api/host-requests (With Organizer Token)...');
  const orgRes = await fetch(`${BASE_URL}/api/host-requests`, {
    headers: { 'Authorization': `Bearer ${tokenOrg}` }
  });
  const orgData = await orgRes.json();
  console.log(`   Status: ${orgRes.status}`);
  console.log(`   Requests Count: ${orgData.count}`);
  if (orgRes.status !== 200 || orgData.count !== 1) {
    throw new Error('Authorized organizer failed to view host requests!');
  }
  console.log('   [SUCCESS] Authorized staff/organizer successfully retrieved host requests.\n');

  // TEST 5: PROTECTED STATUS UPDATE
  console.log('8. Testing Status Update PATCH /api/host-requests/:id/status...');
  const patchRes = await fetch(`${BASE_URL}/api/host-requests/${requestId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenOrg}` },
    body: JSON.stringify({ status: 'contacted' })
  });
  const patchData = await patchRes.json();
  console.log(`   Status: ${patchRes.status}`);
  console.log(`   Updated Request Status: ${patchData.request.status}`);

  if (patchRes.status !== 200 || patchData.request.status !== 'contacted') {
    throw new Error('Host request status update failed!');
  }
  console.log("   [SUCCESS] Status updated to 'contacted' by authorized staff.\n");

  // CLEANUP
  console.log('9. Cleaning up test data from MySQL DB...');
  await connection.query('DELETE FROM host_requests WHERE id = ?', [requestId]);
  await connection.query('DELETE FROM organizers WHERE id = ?', [orgId]);
  await connection.query('DELETE FROM users WHERE id = ?', [studentId]);
  await connection.end();
  console.log('   Test records purged from DB.\n');

  console.log('--- ALL HOST REQUEST TESTS PASSED SUCCESSFULLY! ---');
}

runHostRequestTests().catch(err => {
  console.error('\nTEST FAILURE:', err);
  process.exit(1);
});
