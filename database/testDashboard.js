const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');

dotenv.config();

const BASE_URL = 'http://localhost:5000';

async function runDashboardTests() {
  console.log('--- STARTING ORGANIZER DASHBOARD API TESTS ---\n');

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'root',
    database: process.env.DB_NAME || 'festora'
  });

  const passHash = await bcrypt.hash('TestPass123!', 10);

  // Seed Organizer A & B
  const [orgA] = await connection.query(
    'INSERT INTO organizers (name, email, phone, password_hash, organization_name) VALUES (?, ?, ?, ?, ?)',
    ['Dash Org A', 'dash.a@test.com', '9876545001', passHash, 'Club Alpha']
  );
  const orgA_Id = orgA.insertId;

  const [orgB] = await connection.query(
    'INSERT INTO organizers (name, email, phone, password_hash, organization_name) VALUES (?, ?, ?, ?, ?)',
    ['Dash Org B', 'dash.b@test.com', '9876545002', passHash, 'Club Beta']
  );
  const orgB_Id = orgB.insertId;

  // Seed Student 1 & 2
  const [s1] = await connection.query(
    'INSERT INTO users (full_name, email, phone, password_hash, college, year_of_study, department) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ['Student One', 'stu1.dash@test.com', '9876545003', passHash, 'IIT Madras', '3rd Year', 'CSE']
  );
  const student1_Id = s1.insertId;

  const [s2] = await connection.query(
    'INSERT INTO users (full_name, email, phone, password_hash, college, year_of_study, department) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ['Student Two', 'stu2.dash@test.com', '9876545004', passHash, 'BITS Pilani', '4th Year', 'ECE']
  );
  const student2_Id = s2.insertId;

  // Tokens
  const tokenOrgA = (await fetch(`${BASE_URL}/api/organizer/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'dash.a@test.com', password: 'TestPass123!' })
  }).then(r => r.json())).token;

  const tokenOrgB = (await fetch(`${BASE_URL}/api/organizer/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'dash.b@test.com', password: 'TestPass123!' })
  }).then(r => r.json())).token;

  const tokenStudent = (await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'stu1.dash@test.com', password: 'TestPass123!' })
  }).then(r => r.json())).token;

  console.log('1. Test accounts setup completed.');

  // Create Events
  const event1 = (await fetch(`${BASE_URL}/api/organizer/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenOrgA}` },
    body: JSON.stringify({
      title: 'Org A Free AI Hackathon', category: 'Tech', venue: 'Main Hall', city: 'Bengaluru',
      event_date: '2026-11-25', start_time: '09:00:00', registration_fee: 0.00, max_participants: 100, status: 'published'
    })
  }).then(r => r.json())).event;

  const event2 = (await fetch(`${BASE_URL}/api/organizer/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenOrgA}` },
    body: JSON.stringify({
      title: 'Org A Draft Workshop', category: 'Tech', venue: 'Room 101', city: 'Bengaluru',
      event_date: '2026-11-30', start_time: '10:00:00', registration_fee: 500.00, status: 'draft'
    })
  }).then(r => r.json())).event;

  const event3 = (await fetch(`${BASE_URL}/api/organizer/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenOrgB}` },
    body: JSON.stringify({
      title: 'Org B Secret Fest', category: 'Music', venue: 'Grounds', city: 'Delhi',
      event_date: '2026-12-05', start_time: '18:00:00', status: 'published'
    })
  }).then(r => r.json())).event;

  // Student 1 registers for Event 1 (Free -> Confirmed + Ticket)
  const reg1Data = await fetch(`${BASE_URL}/api/events/${event1.id}/register`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${tokenStudent}` }
  }).then(r => r.json());

  // Student 2 registers for Event 1 (Paid -> Pending)
  const tokenStudent2 = (await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'stu2.dash@test.com', password: 'TestPass123!' })
  }).then(r => r.json())).token;

  await fetch(`${BASE_URL}/api/events/${event1.id}/register`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${tokenStudent2}` }
  });

  // Organizer A scans & checks in Student 1
  await fetch(`${BASE_URL}/api/organizer/events/${event1.id}/checkin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenOrgA}` },
    body: JSON.stringify({ qr_token: reg1Data.ticket.qr_token })
  });

  console.log('2. Test data populated: Event 1 has 2 registrations (1 confirmed, 1 pending) and 1 check-in.\n');

  // TEST 1: GET /api/organizer/dashboard SUMMARY
  console.log('3. Testing GET /api/organizer/dashboard...');
  const dashRes = await fetch(`${BASE_URL}/api/organizer/dashboard`, {
    headers: { 'Authorization': `Bearer ${tokenOrgA}` }
  });
  const dashData = await dashRes.json();
  console.log(`   Status: ${dashRes.status}`);
  console.log(`   Dashboard Summary:`, JSON.stringify(dashData));

  if (dashRes.status !== 200 || dashData.total_events !== 2 || dashData.published_events !== 1 || dashData.draft_events !== 1 || dashData.total_registrations !== 2 || dashData.total_checked_in !== 1) {
    throw new Error('Organizer dashboard summary counts failed!');
  }
  console.log('   [SUCCESS] Dashboard summary correctly calculated.\n');

  // TEST 2: GET /api/organizer/events WITH STATS
  console.log('4. Testing GET /api/organizer/events (With calculated counts)...');
  const eventsRes = await fetch(`${BASE_URL}/api/organizer/events`, {
    headers: { 'Authorization': `Bearer ${tokenOrgA}` }
  });
  const eventsData = await eventsRes.json();
  console.log(`   Status: ${eventsRes.status}`);
  const event1Item = eventsData.events.find(e => e.id === event1.id);
  console.log(`   Event 1 Reg Count: ${event1Item.registration_count}, Checked-in Count: ${event1Item.checked_in_count}`);

  if (eventsRes.status !== 200 || event1Item.registration_count !== 2 || event1Item.checked_in_count !== 1) {
    throw new Error('GET /api/organizer/events calculated counts failed!');
  }
  console.log('   [SUCCESS] GET /api/organizer/events returned events with calculated registration & check-in counts.\n');

  // TEST 3: GET /api/organizer/events/:eventId/dashboard
  console.log('5. Testing GET /api/organizer/events/:eventId/dashboard...');
  const eventDashRes = await fetch(`${BASE_URL}/api/organizer/events/${event1.id}/dashboard`, {
    headers: { 'Authorization': `Bearer ${tokenOrgA}` }
  });
  const eventDashData = await eventDashRes.json();
  console.log(`   Status: ${eventDashRes.status}`);
  console.log(`   Event Stats:`, JSON.stringify(eventDashData.statistics));

  if (eventDashRes.status !== 200 || eventDashData.statistics.total_registrations !== 2 || eventDashData.statistics.confirmed !== 2 || eventDashData.statistics.checked_in !== 1 || eventDashData.statistics.attendance_percentage !== 50) {
    throw new Error('Event dashboard statistics calculation failed!');
  }
  console.log('   [SUCCESS] Specific event dashboard statistics returned accurately.\n');

  // TEST 4: GET /api/organizer/events/:eventId/registrations
  console.log('6. Testing GET /api/organizer/events/:eventId/registrations...');
  const regsRes = await fetch(`${BASE_URL}/api/organizer/events/${event1.id}/registrations`, {
    headers: { 'Authorization': `Bearer ${tokenOrgA}` }
  });
  const regsData = await regsRes.json();
  console.log(`   Status: ${regsRes.status}`);
  console.log(`   Registered Participants Count: ${regsData.count}`);
  const hasPassHash = JSON.stringify(regsData).includes('password_hash');
  console.log(`   password_hash Leaked: ${hasPassHash}`);

  if (regsRes.status !== 200 || regsData.count !== 2 || hasPassHash) {
    throw new Error('Registered participants endpoint failed or exposed sensitive fields!');
  }
  console.log('   [SUCCESS] Registered participants list returned safely.\n');

  // TEST 5: GET /api/organizer/events/:eventId/checkins
  console.log('7. Testing GET /api/organizer/events/:eventId/checkins...');
  const checkinsRes = await fetch(`${BASE_URL}/api/organizer/events/${event1.id}/checkins`, {
    headers: { 'Authorization': `Bearer ${tokenOrgA}` }
  });
  const checkinsData = await checkinsRes.json();
  console.log(`   Status: ${checkinsRes.status}`);
  console.log(`   Checked-in Count: ${checkinsData.count}`);

  if (checkinsRes.status !== 200 || checkinsData.count !== 1) {
    throw new Error('Checked-in participants list failed!');
  }
  console.log('   [SUCCESS] Checked-in participants list returned cleanly.\n');

  // TEST 6: GET /api/organizer/events/:eventId/export (CSV)
  console.log('8. Testing CSV Export GET /api/organizer/events/:eventId/export...');
  const exportRes = await fetch(`${BASE_URL}/api/organizer/events/${event1.id}/export`, {
    headers: { 'Authorization': `Bearer ${tokenOrgA}` }
  });
  const csvText = await exportRes.text();
  const contentType = exportRes.headers.get('content-type');
  const contentDisp = exportRes.headers.get('content-disposition');
  console.log(`   Status: ${exportRes.status}`);
  console.log(`   Content-Type: ${contentType}`);
  console.log(`   Content-Disposition: ${contentDisp}`);
  console.log(`   CSV Snippet:\n   ${csvText.split('\n').slice(0, 3).join('\n   ')}`);

  if (exportRes.status !== 200 || !contentType.includes('text/csv') || !csvText.includes('Name,Email,Phone')) {
    throw new Error('CSV export failed or headers incorrect!');
  }
  console.log('   [SUCCESS] CSV export generated valid formatted file with proper headers.\n');

  // TEST 7: SECURITY REJECTIONS
  console.log('9. Testing Security Protections (Student Token & Cross-Organizer)...');
  const stuDashRes = await fetch(`${BASE_URL}/api/organizer/dashboard`, {
    headers: { 'Authorization': `Bearer ${tokenStudent}` }
  });
  console.log(`   Student Token Dashboard Status: ${stuDashRes.status}`);

  const crossDashRes = await fetch(`${BASE_URL}/api/organizer/events/${event3.id}/dashboard`, {
    headers: { 'Authorization': `Bearer ${tokenOrgA}` }
  });
  console.log(`   Cross-Organizer Event Dashboard Status: ${crossDashRes.status}`);

  const crossExportRes = await fetch(`${BASE_URL}/api/organizer/events/${event3.id}/export`, {
    headers: { 'Authorization': `Bearer ${tokenOrgA}` }
  });
  console.log(`   Cross-Organizer CSV Export Status: ${crossExportRes.status}`);

  if (stuDashRes.status !== 403 || crossDashRes.status !== 403 || crossExportRes.status !== 403) {
    throw new Error('Security checks failed to block unauthorized access!');
  }
  console.log('   [SUCCESS] All security rejections passed with HTTP 403 Forbidden.\n');

  // CLEANUP
  console.log('10. Cleaning up test data from MySQL DB...');
  await connection.query('DELETE FROM checkins WHERE event_id IN (?, ?, ?)', [event1.id, event2.id, event3.id]);
  await connection.query('DELETE FROM tickets WHERE registration_id IN (SELECT id FROM registrations WHERE event_id IN (?, ?, ?))', [event1.id, event2.id, event3.id]);
  await connection.query('DELETE FROM registrations WHERE event_id IN (?, ?, ?)', [event1.id, event2.id, event3.id]);
  await connection.query('DELETE FROM events WHERE id IN (?, ?, ?)', [event1.id, event2.id, event3.id]);
  await connection.query('DELETE FROM organizers WHERE id IN (?, ?)', [orgA_Id, orgB_Id]);
  await connection.query('DELETE FROM users WHERE id IN (?, ?)', [student1_Id, student2_Id]);
  await connection.end();
  console.log('    Database cleaned. 0 test records remain.\n');

  console.log('--- ALL ORGANIZER DASHBOARD API TESTS PASSED SUCCESSFULLY! ---');
}

runDashboardTests().catch(err => {
  console.error('\nTEST FAILURE:', err);
  process.exit(1);
});
