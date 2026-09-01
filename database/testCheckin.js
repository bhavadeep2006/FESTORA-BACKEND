const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');

dotenv.config();

const BASE_URL = 'http://localhost:5000';

async function runCheckinTests() {
  console.log('--- STARTING ORGANIZER QR SCANNER & CHECK-IN API TESTS ---\n');

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'root',
    database: process.env.DB_NAME || 'festora'
  });

  const passHash = await bcrypt.hash('TestPass123!', 10);

  // Seed Organizer A & Organizer B
  const [orgA] = await connection.query(
    'INSERT INTO organizers (name, email, phone, password_hash, organization_name) VALUES (?, ?, ?, ?, ?)',
    ['Organizer Alpha', 'org.alpha@test.com', '9876544001', passHash, 'Alpha Club']
  );
  const orgA_Id = orgA.insertId;

  const [orgB] = await connection.query(
    'INSERT INTO organizers (name, email, phone, password_hash, organization_name) VALUES (?, ?, ?, ?, ?)',
    ['Organizer Beta', 'org.beta@test.com', '9876544002', passHash, 'Beta Club']
  );
  const orgB_Id = orgB.insertId;

  // Seed Student
  const [stu] = await connection.query(
    'INSERT INTO users (full_name, email, phone, password_hash, college, year_of_study, department) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ['Charlie Student', 'charlie.scan@test.com', '9876544003', passHash, 'IIT Bombay', '2nd Year', 'CS']
  );
  const studentId = stu.insertId;

  // Login tokens
  const tokenOrgA = (await fetch(`${BASE_URL}/api/organizer/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'org.alpha@test.com', password: 'TestPass123!' })
  }).then(r => r.json())).token;

  const tokenOrgB = (await fetch(`${BASE_URL}/api/organizer/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'org.beta@test.com', password: 'TestPass123!' })
  }).then(r => r.json())).token;

  const tokenStudent = (await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'charlie.scan@test.com', password: 'TestPass123!' })
  }).then(r => r.json())).token;

  console.log('1. Test setup completed & tokens generated.');

  // Create Events
  const eventA = (await fetch(`${BASE_URL}/api/organizer/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenOrgA}` },
    body: JSON.stringify({
      title: 'Alpha Coding Championship', category: 'Tech', venue: 'Hall 1', city: 'Mumbai',
      event_date: '2026-12-20', start_time: '10:00:00', registration_fee: 0.00, status: 'published'
    })
  }).then(r => r.json())).event;

  const eventB = (await fetch(`${BASE_URL}/api/organizer/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenOrgB}` },
    body: JSON.stringify({
      title: 'Beta Gaming Night', category: 'Gaming', venue: 'Hall 2', city: 'Mumbai',
      event_date: '2026-12-22', start_time: '18:00:00', registration_fee: 0.00, status: 'published'
    })
  }).then(r => r.json())).event;

  // Student registers for Event A (Free event -> Ticket generated)
  const regRes = await fetch(`${BASE_URL}/api/events/${eventA.id}/register`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${tokenStudent}` }
  });
  const regData = await regRes.json();
  const ticket = regData.ticket;
  console.log(`2. Event A created (ID ${eventA.id}), Student registered, Ticket generated: ${ticket.ticket_code} (QR: ${ticket.qr_token})\n`);

  // TEST 1: VALID ORGANIZER SCANS VALID TICKET
  console.log("3. Organizer Alpha scanning valid ticket for Event A...");
  const scanRes = await fetch(`${BASE_URL}/api/organizer/events/${eventA.id}/checkin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenOrgA}` },
    body: JSON.stringify({ qr_token: ticket.qr_token })
  });
  const scanData = await scanRes.json();
  console.log(`   Status: ${scanRes.status}`);
  console.log(`   Response:`, JSON.stringify(scanData));

  if (scanRes.status !== 200 || !scanData.success || scanData.ticket_code !== ticket.ticket_code) {
    throw new Error('Check-in failed for valid QR code!');
  }

  const [tktCheck] = await connection.query('SELECT ticket_status FROM tickets WHERE id = ?', [ticket.id]);
  console.log(`   Ticket status in MySQL DB: ${tktCheck[0].ticket_status}`);
  if (tktCheck[0].ticket_status !== 'used') {
    throw new Error('Ticket status in MySQL DB was not updated to used!');
  }
  console.log('   [SUCCESS] Valid QR scan succeeded. Ticket status updated to used in MySQL.\n');

  // TEST 2: DUPLICATE CHECK-IN REJECTION
  console.log('4. Rescanning the same ticket again (Duplicate check-in)...');
  const rescanRes = await fetch(`${BASE_URL}/api/organizer/events/${eventA.id}/checkin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenOrgA}` },
    body: JSON.stringify({ qr_token: ticket.qr_token })
  });
  const rescanData = await rescanRes.json();
  console.log(`   Status: ${rescanRes.status}`);
  console.log(`   Response:`, JSON.stringify(rescanData));

  if (rescanData.success !== false || rescanData.message !== 'Ticket has already been used') {
    throw new Error('Duplicate QR scan was not rejected!');
  }
  console.log('   [SUCCESS] Duplicate scan correctly rejected with message "Ticket has already been used".\n');

  // TEST 3: INVALID QR TOKEN
  console.log('5. Testing Invalid QR Code Token...');
  const invalidRes = await fetch(`${BASE_URL}/api/organizer/events/${eventA.id}/checkin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenOrgA}` },
    body: JSON.stringify({ qr_token: 'FAKE-QR-TOKEN-999' })
  });
  const invalidData = await invalidRes.json();
  console.log(`   Status: ${invalidRes.status}`);
  console.log(`   Response:`, JSON.stringify(invalidData));
  if (invalidData.success !== false) {
    throw new Error('Invalid QR code was not rejected!');
  }
  console.log('   [SUCCESS] Invalid QR code rejected cleanly.\n');

  // TEST 4: STUDENT JWT ATTEMPTS CHECK-IN
  console.log('6. Testing Student Token attempting QR check-in...');
  const stuScanRes = await fetch(`${BASE_URL}/api/organizer/events/${eventA.id}/checkin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenStudent}` },
    body: JSON.stringify({ qr_token: ticket.qr_token })
  });
  console.log(`   Status: ${stuScanRes.status}`);
  if (stuScanRes.status !== 403) {
    throw new Error('Student token was not rejected on check-in endpoint!');
  }
  console.log('   [SUCCESS] Student token rejected with 403 Forbidden.\n');

  // TEST 5: NO JWT TOKEN
  console.log('7. Testing Check-in Without Token...');
  const noTokRes = await fetch(`${BASE_URL}/api/organizer/events/${eventA.id}/checkin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ qr_token: ticket.qr_token })
  });
  console.log(`   Status: ${noTokRes.status}`);
  if (noTokRes.status !== 401) {
    throw new Error('Unauthenticated check-in was not rejected!');
  }
  console.log('   [SUCCESS] Unauthenticated request rejected with 401 Unauthorized.\n');

  // TEST 6: ORGANIZER ALPHA ATTEMPTS SCAN FOR ORGANIZER BETA EVENT
  console.log("8. Testing Organizer Alpha scanning for Organizer Beta's Event (Event B)...");
  const crossScanRes = await fetch(`${BASE_URL}/api/organizer/events/${eventB.id}/checkin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenOrgA}` },
    body: JSON.stringify({ qr_token: ticket.qr_token })
  });
  console.log(`   Status: ${crossScanRes.status}`);
  if (crossScanRes.status !== 403) {
    throw new Error("Organizer Alpha was not blocked from Event B's scanner!");
  }
  console.log("   [SUCCESS] Cross-organizer check-in attempt rejected with 403 Forbidden.\n");

  // TEST 7 & 8: CROSS-ORGANIZER ACCESS FOR REGISTRATIONS AND CHECKINS
  console.log("9. Testing Organizer Alpha accessing Organizer Beta's Registrations & Checkins...");
  const crossRegsRes = await fetch(`${BASE_URL}/api/organizer/events/${eventB.id}/registrations`, {
    headers: { 'Authorization': `Bearer ${tokenOrgA}` }
  });
  console.log(`   Registrations Status: ${crossRegsRes.status}`);

  const crossCheckinsRes = await fetch(`${BASE_URL}/api/organizer/events/${eventB.id}/checkins`, {
    headers: { 'Authorization': `Bearer ${tokenOrgA}` }
  });
  console.log(`   Checkins Status: ${crossCheckinsRes.status}`);

  if (crossRegsRes.status !== 403 || crossCheckinsRes.status !== 403) {
    throw new Error("Cross-organizer data viewing was not blocked!");
  }
  console.log("   [SUCCESS] Cross-organizer data viewing blocked with 403 Forbidden.\n");

  // TEST 9: ATTENDANCE SUMMARY COUNT
  console.log('10. Testing Attendance Summary for Event A (GET /api/organizer/events/:id/attendance)...');
  const attRes = await fetch(`${BASE_URL}/api/organizer/events/${eventA.id}/attendance`, {
    headers: { 'Authorization': `Bearer ${tokenOrgA}` }
  });
  const attData = await attRes.json();
  console.log(`   Status: ${attRes.status}`);
  console.log(`   Attendance Summary:`, JSON.stringify(attData));

  if (attRes.status !== 200 || attData.total_registrations !== 1 || attData.checked_in !== 1 || attData.remaining !== 0) {
    throw new Error('Attendance summary counts do not match!');
  }
  console.log('   [SUCCESS] Attendance summary correctly reflects 1 total registration, 1 checked-in, 0 remaining.\n');

  // CLEANUP
  console.log('11. Cleaning up test data from MySQL DB...');
  await connection.query('DELETE FROM checkins WHERE event_id IN (?, ?)', [eventA.id, eventB.id]);
  await connection.query('DELETE FROM tickets WHERE registration_id IN (SELECT id FROM registrations WHERE event_id IN (?, ?))', [eventA.id, eventB.id]);
  await connection.query('DELETE FROM registrations WHERE event_id IN (?, ?)', [eventA.id, eventB.id]);
  await connection.query('DELETE FROM events WHERE id IN (?, ?)', [eventA.id, eventB.id]);
  await connection.query('DELETE FROM organizers WHERE id IN (?, ?)', [orgA_Id, orgB_Id]);
  await connection.query('DELETE FROM users WHERE id = ?', [studentId]);
  await connection.end();
  console.log('    Database cleaned. 0 test records remain.\n');

  console.log('--- ALL ORGANIZER QR SCANNER & CHECK-IN TESTS PASSED SUCCESSFULLY! ---');
}

runCheckinTests().catch(err => {
  console.error('\nTEST FAILURE:', err);
  process.exit(1);
});
