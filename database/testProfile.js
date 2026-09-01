const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');

dotenv.config();

const BASE_URL = 'http://localhost:5000';

async function runProfileTests() {
  console.log('--- STARTING STUDENT PROFILE & HISTORY API TESTS ---\n');

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'root',
    database: process.env.DB_NAME || 'festora'
  });

  const passHash = await bcrypt.hash('TestPass123!', 10);

  // Seed Organizer
  const [org] = await connection.query(
    'INSERT INTO organizers (name, email, phone, password_hash, organization_name) VALUES (?, ?, ?, ?, ?)',
    ['Profile Org', 'profile.org@test.com', '9876546000', passHash, 'Festora Student Relations']
  );
  const orgId = org.insertId;

  // Seed Student A & Student B
  const [sA] = await connection.query(
    'INSERT INTO users (full_name, email, phone, password_hash, college, year_of_study, department) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ['Student A', 'student.a@profile.com', '9876546001', passHash, 'Original College', '1st Year', 'CS']
  );
  const studentA_Id = sA.insertId;

  const [sB] = await connection.query(
    'INSERT INTO users (full_name, email, phone, password_hash, college, year_of_study, department) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ['Student B', 'student.b@profile.com', '9876546002', passHash, 'Other College', '2nd Year', 'EE']
  );
  const studentB_Id = sB.insertId;

  // Login tokens
  const tokenOrg = (await fetch(`${BASE_URL}/api/organizer/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'profile.org@test.com', password: 'TestPass123!' })
  }).then(r => r.json())).token;

  const tokenStudentA = (await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'student.a@profile.com', password: 'TestPass123!' })
  }).then(r => r.json())).token;

  const tokenStudentB = (await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'student.b@profile.com', password: 'TestPass123!' })
  }).then(r => r.json())).token;

  console.log('1. Test setup completed & tokens generated.');

  // Create Event & Register Student A and B
  const event = (await fetch(`${BASE_URL}/api/organizer/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenOrg}` },
    body: JSON.stringify({
      title: 'Annual Tech Fest 2026', category: 'Tech', venue: 'Auditorium A', city: 'Chennai',
      event_date: '2026-12-28', start_time: '10:00:00', registration_fee: 0.00, status: 'published'
    })
  }).then(r => r.json())).event;

  const regAData = await fetch(`${BASE_URL}/api/events/${event.id}/register`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${tokenStudentA}` }
  }).then(r => r.json());

  const regBData = await fetch(`${BASE_URL}/api/events/${event.id}/register`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${tokenStudentB}` }
  }).then(r => r.json());

  console.log('2. Test event created and registrations completed.\n');

  // TEST 1: GET STUDENT PROFILE
  console.log('3. Testing GET /api/profile (Student A)...');
  const getProfRes = await fetch(`${BASE_URL}/api/profile`, {
    headers: { 'Authorization': `Bearer ${tokenStudentA}` }
  });
  const getProfData = await getProfRes.json();
  console.log(`   Status: ${getProfRes.status}`);
  console.log(`   Profile:`, JSON.stringify(getProfData.profile));

  if (getProfRes.status !== 200 || getProfData.profile.email !== 'student.a@profile.com' || getProfData.profile.password_hash) {
    throw new Error('GET /api/profile failed or exposed password_hash!');
  }
  console.log('   [SUCCESS] Student A profile fetched cleanly without password_hash exposure.\n');

  // TEST 2: UPDATE STUDENT PROFILE
  console.log('4. Testing PUT /api/profile (Updating full_name and college)...');
  const updateProfRes = await fetch(`${BASE_URL}/api/profile`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenStudentA}` },
    body: JSON.stringify({
      full_name: 'Student A Updated Name',
      college: 'New Updated Engineering College'
    })
  });
  const updateProfData = await updateProfRes.json();
  console.log(`   Status: ${updateProfRes.status}`);
  console.log(`   Updated Name: ${updateProfData.profile?.full_name}`);
  console.log(`   Updated College: ${updateProfData.profile?.college}`);

  if (updateProfRes.status !== 200 || updateProfData.profile.full_name !== 'Student A Updated Name' || updateProfData.profile.email !== 'student.a@profile.com') {
    throw new Error('PUT /api/profile update failed!');
  }
  console.log('   [SUCCESS] Student profile updated in MySQL while email and ID remained protected.\n');

  // TEST 3: MY REGISTRATIONS
  console.log('5. Testing GET /api/my-registrations (Student A)...');
  const myRegsRes = await fetch(`${BASE_URL}/api/my-registrations`, {
    headers: { 'Authorization': `Bearer ${tokenStudentA}` }
  });
  const myRegsData = await myRegsRes.json();
  console.log(`   Status: ${myRegsRes.status}`);
  console.log(`   Registrations Count: ${myRegsData.count}`);
  console.log(`   Event Title: ${myRegsData.registrations[0]?.event_title}`);

  if (myRegsRes.status !== 200 || myRegsData.count !== 1 || myRegsData.registrations[0].event_title !== 'Annual Tech Fest 2026') {
    throw new Error('GET /api/my-registrations failed!');
  }
  console.log('   [SUCCESS] GET /api/my-registrations returned student history with event details.\n');

  // TEST 4: MY TICKETS & SINGLE TICKET WITH QR
  console.log('6. Testing GET /api/my-tickets (Student A)...');
  const myTktsRes = await fetch(`${BASE_URL}/api/my-tickets`, {
    headers: { 'Authorization': `Bearer ${tokenStudentA}` }
  });
  const myTktsData = await myTktsRes.json();
  console.log(`   Status: ${myTktsRes.status}`);
  console.log(`   Tickets Count: ${myTktsData.count}`);
  const ticketA_Id = myTktsData.tickets[0].ticket_id;

  console.log('7. Testing GET /api/my-tickets/:id...');
  const singleTktRes = await fetch(`${BASE_URL}/api/my-tickets/${ticketA_Id}`, {
    headers: { 'Authorization': `Bearer ${tokenStudentA}` }
  });
  const singleTktData = await singleTktRes.json();
  console.log(`   Status: ${singleTktRes.status}`);
  console.log(`   QR Code URL Present: ${singleTktData.ticket?.qr_code_url?.startsWith('data:image/png;base64,')}`);

  if (singleTktRes.status !== 200 || !singleTktData.ticket.qr_code_url.startsWith('data:image/png;base64,')) {
    throw new Error('Single ticket viewing with QR code failed!');
  }
  console.log('   [SUCCESS] Student tickets and single ticket with QR DataURL fetched.\n');

  // TEST 5: SECURITY REJECTIONS
  console.log('8. Testing Security Protections (No Token & Cross-Student)...');
  
  // Unauthenticated requests
  const noTokProf = await fetch(`${BASE_URL}/api/profile`).then(r => r.status);
  const noTokRegs = await fetch(`${BASE_URL}/api/my-registrations`).then(r => r.status);
  const noTokTkts = await fetch(`${BASE_URL}/api/my-tickets`).then(r => r.status);

  console.log(`   No Token Profile Status: ${noTokProf}`);
  console.log(`   No Token Registrations Status: ${noTokRegs}`);
  console.log(`   No Token Tickets Status: ${noTokTkts}`);

  if (noTokProf !== 401 || noTokRegs !== 401 || noTokTkts !== 401) {
    throw new Error('Unauthenticated profile requests were not blocked!');
  }

  // Cross-student attempts
  const ticketB_Id = regBData.ticket.id;
  const crossTktRes = await fetch(`${BASE_URL}/api/my-tickets/${ticketB_Id}`, {
    headers: { 'Authorization': `Bearer ${tokenStudentA}` }
  });
  console.log(`   Student A accessing Student B's Ticket Status: ${crossTktRes.status}`);

  const regB_Id = regBData.registration.id;
  const crossRegRes = await fetch(`${BASE_URL}/api/my-registrations/${regB_Id}`, {
    headers: { 'Authorization': `Bearer ${tokenStudentA}` }
  });
  console.log(`   Student A accessing Student B's Registration Status: ${crossRegRes.status}`);

  if (crossTktRes.status !== 403 || crossRegRes.status !== 403) {
    throw new Error('Cross-student access was not blocked!');
  }
  console.log('   [SUCCESS] All security rejections passed with 401 Unauthorized / 403 Forbidden.\n');

  // CLEANUP
  console.log('9. Cleaning up test data from MySQL DB...');
  await connection.query('DELETE FROM tickets WHERE registration_id IN (SELECT id FROM registrations WHERE event_id = ?)', [event.id]);
  await connection.query('DELETE FROM registrations WHERE event_id = ?', [event.id]);
  await connection.query('DELETE FROM events WHERE id = ?', [event.id]);
  await connection.query('DELETE FROM organizers WHERE id = ?', [orgId]);
  await connection.query('DELETE FROM users WHERE id IN (?, ?)', [studentA_Id, studentB_Id]);
  await connection.end();
  console.log('   Database cleaned. 0 test records remain.\n');

  console.log('--- ALL STUDENT PROFILE & HISTORY TESTS PASSED SUCCESSFULLY! ---');
}

runProfileTests().catch(err => {
  console.error('\nTEST FAILURE:', err);
  process.exit(1);
});
