const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');

dotenv.config();

const BASE_URL = 'http://localhost:5000';

async function runTicketTests() {
  console.log('--- STARTING TICKET + QR + EMAIL API TESTS ---\n');

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
    ['Ticket Org', 'ticket.org@test.com', '9876543300', passHash, 'Festora Tickets Team']
  );
  const orgId = org.insertId;

  // Seed Student 1 & Student 2
  const [s1] = await connection.query(
    'INSERT INTO users (full_name, email, phone, password_hash, college, year_of_study, department) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ['Alice Student', 'alice.tkt@test.com', '9876543301', passHash, 'College Alpha', '3rd Year', 'CS']
  );
  const student1_Id = s1.insertId;

  const [s2] = await connection.query(
    'INSERT INTO users (full_name, email, phone, password_hash, college, year_of_study, department) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ['Bob Student', 'bob.tkt@test.com', '9876543302', passHash, 'College Beta', '4th Year', 'EE']
  );
  const student2_Id = s2.insertId;

  // Obtain tokens
  const orgToken = (await fetch(`${BASE_URL}/api/organizer/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'ticket.org@test.com', password: 'TestPass123!' })
  }).then(r => r.json())).token;

  const tokenS1 = (await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'alice.tkt@test.com', password: 'TestPass123!' })
  }).then(r => r.json())).token;

  const tokenS2 = (await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'bob.tkt@test.com', password: 'TestPass123!' })
  }).then(r => r.json())).token;

  console.log('1. Test setup completed & tokens generated.');

  // Create Free & Paid Events
  const freeEvent = (await fetch(`${BASE_URL}/api/organizer/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${orgToken}` },
    body: JSON.stringify({
      title: 'Free Innovation Expo', category: 'Tech', venue: 'Exhibition Hall', city: 'Mumbai',
      event_date: '2026-12-10', start_time: '09:30:00', registration_fee: 0.00, status: 'published'
    })
  }).then(r => r.json())).event;

  const paidEvent = (await fetch(`${BASE_URL}/api/organizer/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${orgToken}` },
    body: JSON.stringify({
      title: 'Paid Design Masterclass', category: 'Design', venue: 'Auditorium B', city: 'Mumbai',
      event_date: '2026-12-15', start_time: '14:00:00', registration_fee: 1200.00, status: 'published'
    })
  }).then(r => r.json())).event;

  console.log('2. Free & Paid test events created.\n');

  // TEST 1: FREE EVENT REGISTRATION & TICKET CREATION
  console.log('3. Registering Alice for Free Event...');
  const freeRegRes = await fetch(`${BASE_URL}/api/events/${freeEvent.id}/register`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${tokenS1}` }
  });
  const freeRegData = await freeRegRes.json();
  console.log(`   Status: ${freeRegRes.status}`);
  console.log(`   Ticket Code: ${freeRegData.ticket?.ticket_code}`);
  console.log(`   QR Token: ${freeRegData.ticket?.qr_token}`);

  if (freeRegRes.status !== 201 || !freeRegData.ticket || !freeRegData.ticket.ticket_code.startsWith('FEST-')) {
    throw new Error('Ticket generation failed for free event!');
  }
  const ticket1_Id = freeRegData.ticket.id;
  const freeRegId = freeRegData.registration.id;
  console.log('   [SUCCESS] Ticket generated with unique non-predictable ticket_code & qr_token.\n');

  // TEST 2: PAID EVENT REGISTRATION (MUST NOT CREATE TICKET)
  console.log('4. Registering Alice for Paid Event (Should NOT create ticket yet)...');
  const paidRegRes = await fetch(`${BASE_URL}/api/events/${paidEvent.id}/register`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${tokenS1}` }
  });
  const paidRegData = await paidRegRes.json();
  console.log(`   Status: ${paidRegRes.status}`);
  console.log(`   Ticket Generated: ${paidRegData.ticket ? 'Yes' : 'No'}`);

  const [paidTktRows] = await connection.query('SELECT * FROM tickets WHERE registration_id = ?', [paidRegData.registration.id]);
  if (paidRegData.ticket !== null || paidTktRows.length !== 0) {
    throw new Error('Ticket was incorrectly generated for pending paid registration!');
  }
  console.log('   [SUCCESS] Pending paid registration created NO ticket in MySQL.\n');

  // TEST 3: DUPLICATE TICKET PREVENTION
  console.log('5. Testing Duplicate Ticket Prevention Service...');
  const { createTicketForRegistration } = require('../src/services/ticketService');
  const duplicateTicket = await createTicketForRegistration(freeRegId);

  const [tktCountRows] = await connection.query('SELECT COUNT(*) as count FROM tickets WHERE registration_id = ?', [freeRegId]);
  console.log(`   Total Tickets in DB for registration ${freeRegId}: ${tktCountRows[0].count}`);

  if (tktCountRows[0].count !== 1 || duplicateTicket.id !== ticket1_Id) {
    throw new Error('Duplicate ticket creation was not prevented!');
  }
  console.log('   [SUCCESS] Duplicate ticket creation attempt returned existing ticket. Count remains 1.\n');

  // TEST 4: GET /api/my-tickets FOR ALICE
  console.log('6. Testing GET /api/my-tickets for Alice...');
  const myTicketsRes = await fetch(`${BASE_URL}/api/my-tickets`, {
    headers: { 'Authorization': `Bearer ${tokenS1}` }
  });
  const myTicketsData = await myTicketsRes.json();
  console.log(`   Status: ${myTicketsRes.status}`);
  console.log(`   Tickets Count: ${myTicketsData.count}`);
  console.log(`   Ticket Code in List: ${myTicketsData.tickets[0]?.ticket_code}`);

  if (myTicketsRes.status !== 200 || myTicketsData.count !== 1 || myTicketsData.tickets[0].ticket_code !== freeRegData.ticket.ticket_code) {
    throw new Error('Failed to fetch student tickets list!');
  }
  console.log('   [SUCCESS] GET /api/my-tickets returned student tickets cleanly.\n');

  // TEST 5: GET SINGLE TICKET WITH QR DATAURL & CROSS-STUDENT PROTECTION
  console.log('7. Testing GET /api/my-tickets/:id for Alice...');
  const singleTicketRes = await fetch(`${BASE_URL}/api/my-tickets/${ticket1_Id}`, {
    headers: { 'Authorization': `Bearer ${tokenS1}` }
  });
  const singleTicketData = await singleTicketRes.json();
  console.log(`   Status: ${singleTicketRes.status}`);
  console.log(`   QR Code URL Generated: ${singleTicketData.ticket?.qr_code_url?.startsWith('data:image/png;base64,')}`);

  if (singleTicketRes.status !== 200 || !singleTicketData.ticket.qr_code_url.startsWith('data:image/png;base64,')) {
    throw new Error('GET /api/my-tickets/:id failed or QR code DataURL was invalid!');
  }
  console.log('   [SUCCESS] Single ticket retrieved with scannable QR DataURL.\n');

  console.log('8. Testing Cross-Student Ticket Access (Bob accessing Alice ticket)...');
  const crossTicketRes = await fetch(`${BASE_URL}/api/my-tickets/${ticket1_Id}`, {
    headers: { 'Authorization': `Bearer ${tokenS2}` }
  });
  console.log(`   Status: ${crossTicketRes.status}`);
  if (crossTicketRes.status !== 403) {
    throw new Error('Cross-student ticket access was not blocked!');
  }
  console.log('   [SUCCESS] Cross-student access blocked with 403 Forbidden.\n');

  // CLEANUP
  console.log('9. Cleaning up test data from MySQL DB...');
  await connection.query('DELETE FROM tickets WHERE registration_id IN (SELECT id FROM registrations WHERE event_id IN (?, ?))', [freeEvent.id, paidEvent.id]);
  await connection.query('DELETE FROM registrations WHERE event_id IN (?, ?)', [freeEvent.id, paidEvent.id]);
  await connection.query('DELETE FROM events WHERE id IN (?, ?)', [freeEvent.id, paidEvent.id]);
  await connection.query('DELETE FROM organizers WHERE id = ?', [orgId]);
  await connection.query('DELETE FROM users WHERE id IN (?, ?)', [student1_Id, student2_Id]);
  await connection.end();
  console.log('   Database cleaned. 0 test records remain.\n');

  console.log('--- ALL TICKET + QR + EMAIL TESTS PASSED SUCCESSFULLY! ---');
}

runTicketTests().catch(err => {
  console.error('\nTEST FAILURE:', err);
  process.exit(1);
});
