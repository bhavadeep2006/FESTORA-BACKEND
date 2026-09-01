const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');

dotenv.config();

const BASE_URL = 'http://localhost:5000';

async function runRegistrationTests() {
  console.log('--- STARTING EVENT REGISTRATION API TESTS ---\n');

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
    ['Reg Organizer', 'reg.org@test.com', '9876543200', passHash, 'Fest Club']
  );
  const orgId = org.insertId;

  // Seed Student 1 & Student 2
  const [s1] = await connection.query(
    'INSERT INTO users (full_name, email, phone, password_hash, college, year_of_study, department) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ['Student One', 'student1.reg@test.com', '9876543201', passHash, 'College A', '3rd Year', 'CS']
  );
  const student1_Id = s1.insertId;

  const [s2] = await connection.query(
    'INSERT INTO users (full_name, email, phone, password_hash, college, year_of_study, department) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ['Student Two', 'student2.reg@test.com', '9876543202', passHash, 'College B', '4th Year', 'IT']
  );
  const student2_Id = s2.insertId;

  // Login tokens
  const orgToken = (await fetch(`${BASE_URL}/api/organizer/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'reg.org@test.com', password: 'TestPass123!' })
  }).then(r => r.json())).token;

  const tokenS1 = (await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'student1.reg@test.com', password: 'TestPass123!' })
  }).then(r => r.json())).token;

  const tokenS2 = (await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'student2.reg@test.com', password: 'TestPass123!' })
  }).then(r => r.json())).token;

  console.log('1. Test setup completed & tokens generated.');

  // Create Events
  const freeEvent = (await fetch(`${BASE_URL}/api/organizer/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${orgToken}` },
    body: JSON.stringify({
      title: 'Free Open Hackathon', category: 'Tech', venue: 'Hall 1', city: 'Delhi',
      event_date: '2026-11-01', start_time: '10:00:00', registration_fee: 0.00, status: 'published'
    })
  }).then(r => r.json())).event;

  const paidEvent = (await fetch(`${BASE_URL}/api/organizer/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${orgToken}` },
    body: JSON.stringify({
      title: 'Paid Robotics Workshop', category: 'Tech', venue: 'Hall 2', city: 'Delhi',
      event_date: '2026-11-02', start_time: '14:00:00', registration_fee: 500.00, status: 'published'
    })
  }).then(r => r.json())).event;

  const fullEvent = (await fetch(`${BASE_URL}/api/organizer/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${orgToken}` },
    body: JSON.stringify({
      title: 'Limited VIP Seminar', category: 'Tech', venue: 'Boardroom', city: 'Delhi',
      event_date: '2026-11-03', start_time: '11:00:00', registration_fee: 0.00, max_participants: 1, status: 'published'
    })
  }).then(r => r.json())).event;

  const draftEvent = (await fetch(`${BASE_URL}/api/organizer/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${orgToken}` },
    body: JSON.stringify({
      title: 'Unpublished Draft Event', category: 'Tech', venue: 'Secret Room', city: 'Delhi',
      event_date: '2026-11-04', start_time: '11:00:00', status: 'draft'
    })
  }).then(r => r.json())).event;

  console.log('2. Test events created in MySQL.\n');

  // TEST 1: FREE EVENT REGISTRATION
  console.log('3. Testing Free Event Registration (POST /api/events/:id/register)...');
  const freeRegRes = await fetch(`${BASE_URL}/api/events/${freeEvent.id}/register`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${tokenS1}` }
  });
  const freeRegData = await freeRegRes.json();
  console.log(`   Status: ${freeRegRes.status}`);
  console.log(`   Registration Status: ${freeRegData.registration?.registration_status}`);
  console.log(`   Ticket Issued: Code=${freeRegData.ticket?.ticket_code}, Status=${freeRegData.ticket?.ticket_status}`);

  if (freeRegRes.status !== 201 || freeRegData.registration.registration_status !== 'confirmed' || !freeRegData.ticket) {
    throw new Error('Free event registration failed to confirm or generate ticket!');
  }
  const freeRegId = freeRegData.registration.id;
  console.log('   [SUCCESS] Free event registration immediately confirmed & ticket generated.\n');

  // TEST 2: DUPLICATE REGISTRATION REJECTION
  console.log('4. Testing Duplicate Registration Rejection...');
  const dupRes = await fetch(`${BASE_URL}/api/events/${freeEvent.id}/register`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${tokenS1}` }
  });
  console.log(`   Status: ${dupRes.status}`);
  if (dupRes.status !== 409) {
    throw new Error('Duplicate registration was not rejected!');
  }
  console.log('   [SUCCESS] Duplicate registration rejected with 409 Conflict.\n');

  // TEST 3: PAID EVENT REGISTRATION
  console.log('5. Testing Paid Event Registration...');
  const paidRegRes = await fetch(`${BASE_URL}/api/events/${paidEvent.id}/register`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${tokenS1}` }
  });
  const paidRegData = await paidRegRes.json();
  console.log(`   Status: ${paidRegRes.status}`);
  console.log(`   Registration Status: ${paidRegData.registration?.registration_status}`);
  console.log(`   Payment Required: ${paidRegData.payment_required}`);
  console.log(`   Ticket Generated: ${paidRegData.ticket ? 'Yes' : 'No'}`);

  if (paidRegRes.status !== 201 || paidRegData.registration.registration_status !== 'pending' || paidRegData.ticket !== null) {
    throw new Error('Paid event registration was incorrectly confirmed or issued a ticket before payment!');
  }
  const paidRegId = paidRegData.registration.id;
  console.log('   [SUCCESS] Paid event registration status set to pending. No ticket issued yet.\n');

  // TEST 4: GET MY REGISTRATIONS
  console.log('6. Testing GET /api/my-registrations for Student 1...');
  const myRegsRes = await fetch(`${BASE_URL}/api/my-registrations`, {
    headers: { 'Authorization': `Bearer ${tokenS1}` }
  });
  const myRegsData = await myRegsRes.json();
  console.log(`   Status: ${myRegsRes.status}`);
  console.log(`   Registrations Count: ${myRegsData.count}`);
  if (myRegsRes.status !== 200 || myRegsData.count !== 2) {
    throw new Error('Failed to fetch student registrations!');
  }
  console.log('   [SUCCESS] Student 1 retrieved their 2 registrations cleanly.\n');

  // TEST 5: GET SINGLE REGISTRATION & OWNERSHIP PROTECTION
  console.log("7. Testing GET /api/my-registrations/:id (Student 2 accessing Student 1's Registration)...");
  const crossRegRes = await fetch(`${BASE_URL}/api/my-registrations/${freeRegId}`, {
    headers: { 'Authorization': `Bearer ${tokenS2}` }
  });
  console.log(`   Status: ${crossRegRes.status}`);
  if (crossRegRes.status !== 403) {
    throw new Error('Cross-student registration viewing was not blocked!');
  }
  console.log('   [SUCCESS] Cross-student viewing rejected with 403 Forbidden.\n');

  // TEST 6: CANCEL REGISTRATION
  console.log('8. Testing Registration Cancellation (DELETE /api/my-registrations/:id)...');
  const cancelRes = await fetch(`${BASE_URL}/api/my-registrations/${paidRegId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${tokenS1}` }
  });
  console.log(`   Status: ${cancelRes.status}`);
  if (cancelRes.status !== 200) {
    throw new Error('Registration cancellation failed!');
  }

  const [cancelledCheck] = await connection.query('SELECT registration_status FROM registrations WHERE id = ?', [paidRegId]);
  console.log(`   Status in DB: ${cancelledCheck[0].registration_status}`);
  if (cancelledCheck[0].registration_status !== 'cancelled') {
    throw new Error('Registration status in DB was not updated to cancelled!');
  }
  console.log('   [SUCCESS] Registration status set to cancelled in MySQL.\n');

  // TEST 7: CAPACITY LIMITS
  console.log('9. Testing Event Capacity Enforcement...');
  const cap1Res = await fetch(`${BASE_URL}/api/events/${fullEvent.id}/register`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${tokenS1}` }
  });
  console.log(`   Student 1 Reg Status: ${cap1Res.status}`);

  const cap2Res = await fetch(`${BASE_URL}/api/events/${fullEvent.id}/register`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${tokenS2}` }
  });
  console.log(`   Student 2 Reg Status (Capacity Full): ${cap2Res.status}`);
  if (cap2Res.status !== 409) {
    throw new Error('Capacity limit failed to block registration when full!');
  }
  console.log('   [SUCCESS] Full capacity event rejected registration with 409 Conflict.\n');

  // TEST 8: UNPUBLISHED EVENT REGISTRATION
  console.log('10. Testing Registration for Unpublished Event...');
  const draftRegRes = await fetch(`${BASE_URL}/api/events/${draftEvent.id}/register`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${tokenS1}` }
  });
  console.log(`   Status: ${draftRegRes.status}`);
  if (draftRegRes.status !== 400 && draftRegRes.status !== 404) {
    throw new Error('Registration allowed for draft event!');
  }
  console.log('   [SUCCESS] Draft event registration rejected cleanly.\n');

  // CLEANUP
  console.log('11. Cleaning up test data from MySQL DB...');
  await connection.query('DELETE FROM tickets WHERE registration_id IN (SELECT id FROM registrations WHERE event_id IN (?, ?, ?, ?))', [freeEvent.id, paidEvent.id, fullEvent.id, draftEvent.id]);
  await connection.query('DELETE FROM registrations WHERE event_id IN (?, ?, ?, ?)', [freeEvent.id, paidEvent.id, fullEvent.id, draftEvent.id]);
  await connection.query('DELETE FROM events WHERE id IN (?, ?, ?, ?)', [freeEvent.id, paidEvent.id, fullEvent.id, draftEvent.id]);
  await connection.query('DELETE FROM organizers WHERE id = ?', [orgId]);
  await connection.query('DELETE FROM users WHERE id IN (?, ?)', [student1_Id, student2_Id]);
  await connection.end();
  console.log('    Database cleaned. 0 test records remain.\n');

  console.log('--- ALL EVENT REGISTRATION TESTS PASSED SUCCESSFULLY! ---');
}

runRegistrationTests().catch(err => {
  console.error('\nTEST FAILURE:', err);
  process.exit(1);
});
