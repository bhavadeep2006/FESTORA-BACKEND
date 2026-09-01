const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');

dotenv.config();

const BASE_URL = 'http://localhost:5000';

async function runEventsTests() {
  console.log('--- STARTING EVENTS API TESTS ---\n');

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'root',
    database: process.env.DB_NAME || 'festora'
  });

  // Seed test accounts
  const passwordHash = await bcrypt.hash('TestPass123!', 10);

  // Organizer A
  const [orgA] = await connection.query(
    'INSERT INTO organizers (name, email, phone, password_hash, organization_name) VALUES (?, ?, ?, ?, ?)',
    ['Organizer A', 'org.a@test.com', '9000000001', passwordHash, 'Club A']
  );
  const orgA_Id = orgA.insertId;

  // Organizer B
  const [orgB] = await connection.query(
    'INSERT INTO organizers (name, email, phone, password_hash, organization_name) VALUES (?, ?, ?, ?, ?)',
    ['Organizer B', 'org.b@test.com', '9000000002', passwordHash, 'Club B']
  );
  const orgB_Id = orgB.insertId;

  // Student User
  const [stu] = await connection.query(
    'INSERT INTO users (full_name, email, phone, password_hash, college, year_of_study, department) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ['Student User', 'stu.events@test.com', '9000000003', passwordHash, 'College A', '2nd Year', 'CS']
  );
  const studentId = stu.insertId;

  // Get Tokens via Login
  const orgALogin = await fetch(`${BASE_URL}/api/organizer/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'org.a@test.com', password: 'TestPass123!' })
  }).then(r => r.json());

  const orgBLogin = await fetch(`${BASE_URL}/api/organizer/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'org.b@test.com', password: 'TestPass123!' })
  }).then(r => r.json());

  const studentLogin = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'stu.events@test.com', password: 'TestPass123!' })
  }).then(r => r.json());

  const tokenOrgA = orgALogin.token;
  const tokenOrgB = orgBLogin.token;
  const tokenStudent = studentLogin.token;

  console.log('1. Test accounts created & JWT tokens issued.\n');

  // 1. ORGANIZER A CREATES EVENTS
  console.log('2. Organizer A creates Draft Event 1...');
  const createDraftRes = await fetch(`${BASE_URL}/api/organizer/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenOrgA}` },
    body: JSON.stringify({
      title: 'Private Draft Hackathon',
      category: 'Technical',
      venue: 'Lab 101',
      city: 'Bengaluru',
      event_date: '2026-11-10',
      start_time: '10:00:00',
      status: 'draft'
    })
  });
  const draftData = await createDraftRes.json();
  console.log(`   Status: ${createDraftRes.status}`);
  const event1_id = draftData.event.id;

  console.log('3. Organizer A creates Published Event 2...');
  const createPubRes = await fetch(`${BASE_URL}/api/organizer/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenOrgA}` },
    body: JSON.stringify({
      title: 'Public AI Summit 2026',
      category: 'Technical',
      venue: 'Main Auditorium',
      city: 'Bengaluru',
      event_date: '2026-10-15',
      start_time: '09:00:00',
      status: 'published'
    })
  });
  const pubData = await createPubRes.json();
  console.log(`   Status: ${createPubRes.status}`);
  const event2_id = pubData.event.id;

  console.log('4. Organizer B creates Published Event 3...');
  const createBRes = await fetch(`${BASE_URL}/api/organizer/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenOrgB}` },
    body: JSON.stringify({
      title: 'Organizer B Music Festival',
      category: 'Cultural',
      venue: 'Grounds',
      city: 'Mumbai',
      event_date: '2026-12-01',
      start_time: '18:00:00',
      status: 'published'
    })
  });
  const bData = await createBRes.json();
  const event3_id = bData.event.id;
  console.log('   [SUCCESS] Events created by respective organizers.\n');

  // 2. TEST PUBLIC EVENTS GET
  console.log('5. Testing Public GET /api/events (Draft events MUST be hidden)...');
  const publicRes = await fetch(`${BASE_URL}/api/events`);
  const publicData = await publicRes.json();
  console.log(`   Public Events Count: ${publicData.count}`);
  const containsDraft = publicData.events.some(e => e.id === event1_id);
  console.log(`   Draft Event (ID ${event1_id}) present in public list: ${containsDraft}`);

  if (containsDraft || publicData.count !== 2) {
    throw new Error('Public events endpoint failed to hide draft events!');
  }
  console.log('   [SUCCESS] Draft event is hidden. Only published events returned.\n');

  // 3. TEST PUBLIC SINGLE EVENT GET
  console.log('6. Testing Public GET /api/events/:id for Draft Event...');
  const singleDraftRes = await fetch(`${BASE_URL}/api/events/${event1_id}`);
  console.log(`   Status: ${singleDraftRes.status}`);
  if (singleDraftRes.status !== 404) {
    throw new Error('Public endpoint exposed draft event!');
  }
  console.log('   [SUCCESS] Draft event returned 404 on public single event endpoint.\n');

  console.log('7. Testing Public GET /api/events/:id for Published Event...');
  const singlePubRes = await fetch(`${BASE_URL}/api/events/${event2_id}`);
  const singlePubData = await singlePubRes.json();
  console.log(`   Status: ${singlePubRes.status}`);
  console.log(`   Title: ${singlePubData.event.title}`);
  if (singlePubRes.status !== 200 || singlePubData.event.id !== event2_id) {
    throw new Error('Public endpoint failed for published event!');
  }
  console.log('   [SUCCESS] Published event fetched successfully.\n');

  // 4. TEST ORGANIZER VIEW OWN EVENTS
  console.log('8. Testing GET /api/organizer/events for Organizer A...');
  const orgAEventsRes = await fetch(`${BASE_URL}/api/organizer/events`, {
    headers: { 'Authorization': `Bearer ${tokenOrgA}` }
  });
  const orgAEventsData = await orgAEventsRes.json();
  console.log(`   Organizer A Event Count: ${orgAEventsData.count}`);
  const orgAEventIds = orgAEventsData.events.map(e => e.id);
  console.log(`   Organizer A Event IDs: ${orgAEventIds.join(', ')}`);

  if (orgAEventsData.count !== 2 || orgAEventIds.includes(event3_id)) {
    throw new Error("Organizer A received another organizer's event!");
  }
  console.log("   [SUCCESS] Organizer A received only their own events (both draft & published).\n");

  // 5. TEST OWNERSHIP PROTECTION ON UPDATE & GET SINGLE
  console.log("9. Testing Organizer A accessing Organizer B's Event (GET /api/organizer/events/:id)...");
  const crossGetRes = await fetch(`${BASE_URL}/api/organizer/events/${event3_id}`, {
    headers: { 'Authorization': `Bearer ${tokenOrgA}` }
  });
  console.log(`   Status: ${crossGetRes.status}`);
  if (crossGetRes.status !== 403) {
    throw new Error("Organizer A was not blocked from accessing Organizer B's event!");
  }
  console.log("   [SUCCESS] Cross-organizer access rejected with HTTP 403 Forbidden.\n");

  console.log("10. Testing Organizer A updating Organizer B's Event (PUT /api/organizer/events/:id)...");
  const crossPutRes = await fetch(`${BASE_URL}/api/organizer/events/${event3_id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenOrgA}` },
    body: JSON.stringify({ title: 'Hacked Title' })
  });
  console.log(`   Status: ${crossPutRes.status}`);
  if (crossPutRes.status !== 403) {
    throw new Error("Organizer A was not blocked from modifying Organizer B's event!");
  }
  console.log("   [SUCCESS] Cross-organizer modification rejected with HTTP 403 Forbidden.\n");

  // 6. TEST SECURITY ROLE REJECTIONS
  console.log('11. Testing Event Creation with Student Token...');
  const studentCreateRes = await fetch(`${BASE_URL}/api/organizer/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenStudent}` },
    body: JSON.stringify({ title: 'Student Event', category: 'Tech', venue: 'V', city: 'C', event_date: '2026-10-10', start_time: '10:00:00' })
  });
  console.log(`   Status: ${studentCreateRes.status}`);
  if (studentCreateRes.status !== 403) {
    throw new Error('Student token was not rejected on organizer event creation!');
  }
  console.log('   [SUCCESS] Student token rejected with HTTP 403 Forbidden.\n');

  // 7. TEST DELETE EVENT
  console.log('12. Testing Organizer A deleting Event 1...');
  const deleteRes = await fetch(`${BASE_URL}/api/organizer/events/${event1_id}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${tokenOrgA}` }
  });
  console.log(`   Status: ${deleteRes.status}`);
  if (deleteRes.status !== 200) {
    throw new Error('Event deletion failed!');
  }
  console.log('   [SUCCESS] Event deleted successfully.\n');

  // CLEANUP TEST ACCOUNTS & EVENTS FROM DB
  console.log('13. Cleaning up test data from MySQL DB...');
  await connection.query('DELETE FROM events WHERE id IN (?, ?, ?)', [event1_id, event2_id, event3_id]);
  await connection.query('DELETE FROM organizers WHERE id IN (?, ?)', [orgA_Id, orgB_Id]);
  await connection.query('DELETE FROM users WHERE id = ?', [studentId]);
  await connection.end();
  console.log('    Database cleaned. 0 test records remain.\n');

  console.log('--- ALL EVENTS API TESTS PASSED SUCCESSFULLY! ---');
}

runEventsTests().catch(err => {
  console.error('\nTEST FAILURE:', err);
  process.exit(1);
});
