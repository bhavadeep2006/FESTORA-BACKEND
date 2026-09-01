const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');

dotenv.config();

const BASE_URL = 'http://localhost:5000';

async function runHostRequestTests() {
  console.log('--- STARTING COMPLETE HOST REQUEST & NOTIFICATION API TESTS ---\n');

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'root',
    database: process.env.DB_NAME || 'festora'
  });

  try {
    // Clean prior test records
    await connection.query('DELETE FROM organizers WHERE email = "admin.test@festora.com"');

    const passwordHash = await bcrypt.hash('TestPass123!', 10);

    // Seed organizer
    const [org] = await connection.query(
      'INSERT INTO organizers (name, email, phone, password_hash, organization_name) VALUES (?, ?, ?, ?, ?)',
      ['Festora Admin Test', 'admin.test@festora.com', '9876543210', passwordHash, 'Festora Operations']
    );
    const orgId = org.insertId;

    // Obtain organizer token
    const orgLogin = await fetch(`${BASE_URL}/api/organizer/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin.test@festora.com', password: 'TestPass123!' })
    }).then(r => r.json());

    const tokenOrg = orgLogin.token;

    console.log('1. Test setup completed & organizer token generated.\n');

    // TEST 1: PUBLIC SUBMISSION
    console.log('2. Testing Public Submission (POST /api/host-event-requests)...');
    const validPayload = {
      fullName: 'Alex Johnson',
      email: 'alex.johnson@techclub.edu',
      phone: '9876500112',
      college: 'IIIT Hyderabad',
      role: 'Student Convener',
      city: 'Hyderabad',
      eventName: 'Hack-Versify 2026',
      category: 'Hackathon',
      expectedDate: '2026-10-15',
      expectedParticipants: '500+',
      description: 'Annual 24-hour national hackathon for college developers.',
      additionalInfo: 'Require ticketing assistance & QR gate scanning support.',
      socialLink: 'https://instagram.com/hackversify'
    };

    const submitRes = await fetch(`${BASE_URL}/api/host-event-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validPayload)
    });
    const submitData = await submitRes.json();
    console.log(`   Status: ${submitRes.status}`);
    console.log(`   Response:`, JSON.stringify(submitData));

    if (submitRes.status !== 201 || !submitData.requestId) {
      throw new Error('Host request submission failed! ' + JSON.stringify(submitData));
    }
    const requestId = submitData.requestId;
    console.log('   [SUCCESS] Host request submitted successfully.\n');

    // TEST 2: VERIFY DATABASE RECORD & NOTIFICATION CREATION
    console.log('3. Verifying Database Record & Organizer Notification in MySQL...');
    const [hrRows] = await connection.query('SELECT * FROM host_requests WHERE id = ?', [requestId]);
    const [notifRows] = await connection.query('SELECT * FROM notifications WHERE reference_id = ? AND reference_type = "host_event_request"', [requestId]);

    console.log(`   Host Request ID: #${hrRows[0].id}`);
    console.log(`   Event Name: ${hrRows[0].event_name}`);
    console.log(`   Role: ${hrRows[0].role}`);
    console.log(`   City: ${hrRows[0].city}`);
    console.log(`   Status: ${hrRows[0].status}`);
    console.log(`   Notification Count: ${notifRows.length}`);
    if (notifRows.length > 0) {
      console.log(`   Notification Title: ${notifRows[0].title}`);
      console.log(`   Notification Message: ${notifRows[0].message}`);
      console.log(`   Notification Read State: ${notifRows[0].is_read ? 'READ' : 'UNREAD'}`);
    }

    if (hrRows.length === 0 || hrRows[0].status !== 'pending' || notifRows.length === 0) {
      throw new Error('Host request or notification database creation failed!');
    }
    console.log('   [SUCCESS] Host request & organizer notification verified in MySQL.\n');

    // TEST 4: ORGANIZER NOTIFICATIONS API
    console.log('4. Testing Organizer Notifications API (GET /api/organizer/notifications)...');
    const notifRes = await fetch(`${BASE_URL}/api/organizer/notifications`, {
      headers: { 'Authorization': `Bearer ${tokenOrg}` }
    });
    const notifData = await notifRes.json();
    console.log(`   Status: ${notifRes.status}`);
    console.log(`   Total Notifications: ${notifData.count}`);
    console.log(`   Unread Count: ${notifData.unreadCount}`);
    if (notifRes.status !== 200 || notifData.count === 0) {
      throw new Error('Failed to fetch organizer notifications!');
    }
    console.log('   [SUCCESS] Organizer notifications retrieved.\n');

    // TEST 5: MARK NOTIFICATION READ
    if (notifRows.length > 0) {
      const notifId = notifRows[0].id;
      console.log(`5. Testing Mark Notification Read (PUT /api/organizer/notifications/${notifId}/read)...`);
      const readRes = await fetch(`${BASE_URL}/api/organizer/notifications/${notifId}/read`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${tokenOrg}` }
      });
      console.log(`   Status: ${readRes.status}`);
      if (readRes.status !== 200) {
        throw new Error('Failed to mark notification read!');
      }
      console.log('   [SUCCESS] Notification marked as read.\n');
    }

    // TEST 6: ORGANIZER HOST REQUESTS LIST & STATUS UPDATE
    console.log('6. Testing Organizer Host Requests API (GET /api/organizer/host-event-requests)...');
    const requestsRes = await fetch(`${BASE_URL}/api/organizer/host-event-requests`, {
      headers: { 'Authorization': `Bearer ${tokenOrg}` }
    });
    const requestsData = await requestsRes.json();
    console.log(`   Status: ${requestsRes.status}`);
    console.log(`   Requests Count: ${requestsData.count}`);

    console.log('7. Testing Approve Host Request (PUT /api/organizer/host-event-requests/:id/status)...');
    const approveRes = await fetch(`${BASE_URL}/api/organizer/host-event-requests/${requestId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenOrg}` },
      body: JSON.stringify({ status: 'approved' })
    });
    const approveData = await approveRes.json();
    console.log(`   Status: ${approveRes.status}`);
    console.log(`   Updated Request Status: ${approveData.request.status}`);
    if (approveRes.status !== 200 || approveData.request.status !== 'approved') {
      throw new Error('Host request approval failed!');
    }
    console.log('   [SUCCESS] Host request status updated to approved.\n');

    // CLEANUP
    console.log('8. Cleaning up test data from MySQL DB...');
    await connection.query('DELETE FROM notifications WHERE reference_id = ? AND reference_type = "host_event_request"', [requestId]);
    await connection.query('DELETE FROM host_requests WHERE id = ?', [requestId]);
    await connection.query('DELETE FROM organizers WHERE id = ?', [orgId]);
    console.log('   Test records purged from DB.\n');

    console.log('--- ALL HOST EVENT REQUEST & NOTIFICATION TESTS PASSED SUCCESSFULLY! ---');
  } finally {
    await connection.end();
  }
}

runHostRequestTests().catch(err => {
  console.error('\nTEST FAILURE:', err);
  process.exit(1);
});
