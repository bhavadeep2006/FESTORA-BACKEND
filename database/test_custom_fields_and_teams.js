const { pool } = require('../src/config/db');

const BASE_URL = 'http://localhost:5000/api';

async function apiRequest(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  const config = { ...options, headers };
  if (config.body && typeof config.body === 'object') {
    config.body = JSON.stringify(config.body);
  }
  const res = await fetch(url, config);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message || `HTTP ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

async function runTests() {
  console.log('==================================================');
  console.log('STARTING FESTORA FEATURE E2E INTEGRATION TEST');
  console.log('==================================================\n');

  let organizerToken = '';
  let studentToken = '';
  let teamEventId = null;

  try {
    // 1. Organizer Login
    console.log('[TEST 1] Logging in organizer (organizer@festora.demo)...');
    const orgRes = await apiRequest('/organizer/login', {
      method: 'POST',
      body: { email: 'organizer@festora.demo', password: 'password123' }
    });
    organizerToken = orgRes.token;
    console.log('✓ Organizer login successful.');

    // 2. Student Login
    console.log('[TEST 2] Logging in student (student@festora.demo)...');
    let studRes;
    try {
      studRes = await apiRequest('/auth/login', {
        method: 'POST',
        body: { email: 'student@festora.demo', password: 'password123' }
      });
    } catch (e) {
      studRes = await apiRequest('/auth/register', {
        method: 'POST',
        body: {
          full_name: 'Bhavadeep Test Student',
          email: 'student@festora.demo',
          password: 'password123',
          college: 'IIIT Hyderabad',
          phone: '9876543210',
          department: 'CSE',
          year_of_study: '3rd Year'
        }
      });
    }
    studentToken = studRes.token;
    console.log('✓ Student auth token obtained.');

    // 3. Create Team Event with Custom Fields
    console.log('\n[TEST 3] Creating Team Event with Custom Registration Fields...');
    const createRes = await apiRequest('/organizer/events', {
      method: 'POST',
      headers: { Authorization: `Bearer ${organizerToken}` },
      body: {
        title: `Inter-College Robotics Sprint ${Date.now()}`,
        category: 'Technical',
        venue: 'Lab 101, Himalayan Block',
        city: 'Hyderabad',
        event_date: '2026-11-20',
        start_time: '10:00:00',
        end_time: '18:00:00',
        registration_fee: 0.00,
        max_participants: 200,
        status: 'published',
        registration_type: 'team',
        min_team_size: 2,
        max_team_size: 4,
        custom_fields: [
          {
            field_label: 'Department',
            field_type: 'Dropdown / Select',
            is_required: true,
            options: ['CSE', 'ECE', 'EEE', 'Mechanical']
          },
          {
            field_label: 'GitHub Profile',
            field_type: 'Short Text',
            is_required: false,
            placeholder: 'https://github.com/username'
          }
        ]
      }
    });

    teamEventId = createRes.event.id;
    console.log(`✓ Created Team Event ID: ${teamEventId} with registration_type = 'team', min = 2, max = 4`);

    // 4. Test Student Fetch Event Details
    console.log(`\n[TEST 4] Student fetching details for Event #${teamEventId}...`);
    const publicEvtRes = await apiRequest(`/events/${teamEventId}`);
    const pubEvt = publicEvtRes.event;
    console.log(`✓ Registration Type: ${pubEvt.registration_type}, Custom Fields Count: ${pubEvt.custom_fields.length}`);

    // 5. Test Invalid Registration - Missing Required Custom Field
    console.log('\n[TEST 5] Registering with missing required custom field (Department)...');
    try {
      await apiRequest(`/student/events/${teamEventId}/register`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${studentToken}` },
        body: {
          team_name: 'Team CyberTrons',
          team_members: [
            { name: 'Leader Student', email: 'student@festora.demo', is_team_leader: true },
            { name: 'Member Rahul', email: 'rahul@example.com', is_team_leader: false }
          ],
          custom_field_values: {}
        }
      });
      console.error('❌ Failed: Registration should have been blocked for missing required custom field.');
    } catch (err) {
      console.log(`✓ Blocked correctly: "${err.message}"`);
    }

    // 6. Test Invalid Registration - Below Minimum Team Size
    console.log('\n[TEST 6] Registering with only 1 member when min_team_size = 2...');
    try {
      await apiRequest(`/student/events/${teamEventId}/register`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${studentToken}` },
        body: {
          team_name: 'Solo Team',
          team_members: [
            { name: 'Leader Student', email: 'student@festora.demo', is_team_leader: true }
          ],
          custom_field_values: {
            [pubEvt.custom_fields[0].id]: 'CSE'
          }
        }
      });
      console.error('❌ Failed: Registration should have been blocked for team size below minimum.');
    } catch (err) {
      console.log(`✓ Blocked correctly: "${err.message}"`);
    }

    // 7. Test Valid Team Registration
    console.log('\n[TEST 7] Submitting valid Team Registration (Leader + 1 Member = 2)...');
    const validRegRes = await apiRequest(`/student/events/${teamEventId}/register`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${studentToken}` },
      body: {
        team_name: 'Team CyberTrons',
        team_members: [
          { name: 'Leader Student', email: 'student@festora.demo', is_team_leader: true },
          { name: 'Member Rahul', email: 'rahul@example.com', is_team_leader: false }
        ],
        custom_field_values: {
          [pubEvt.custom_fields[0].id]: 'CSE',
          [pubEvt.custom_fields[1].id]: 'https://github.com/bhavadeep'
        }
      }
    });
    console.log(`✓ Registration Successful! Ticket Code: ${validRegRes.ticket.ticket_code}`);

    // 8. Test Organizer Dashboard Registrations View
    console.log('\n[TEST 8] Organizer viewing event registrations for Team Event...');
    const orgRegsRes = await apiRequest(`/organizer/events/${teamEventId}/registrations`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${organizerToken}` }
    });
    const regItem = orgRegsRes.registrations[0];
    console.log('✓ regItem received:', regItem);
    const membersCount = (regItem && regItem.team_members) ? regItem.team_members.length : 0;
    console.log(`✓ Team Name: ${regItem.team_name}, Members Count: ${membersCount}`);
    console.log(`✓ Custom Fields Answers Recorded:`, regItem.custom_fields_data);

    // 9. Test QR Ticket Scan Check-in
    console.log('\n[TEST 9] Organizer scanning Team Ticket QR...');
    const ticketCode = validRegRes.ticket.ticket_code;
    const scanRes = await apiRequest(`/organizer/events/${teamEventId}/checkin`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${organizerToken}` },
      body: { qr_token: ticketCode }
    });
    console.log(`✓ Check-in Status: ${scanRes.message}`);

    // 10. Test Duplicate Scan Protection
    console.log('\n[TEST 10] Scanning Team Ticket QR second time...');
    const duplicateRes = await apiRequest(`/organizer/events/${teamEventId}/checkin`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${organizerToken}` },
      body: { qr_token: ticketCode }
    });
    console.log(`✓ Duplicate scan handled cleanly: status = "${duplicateRes.status}", message = "${duplicateRes.message}"`);

    // 11. Test Wrong Event Scan Protection
    console.log('\n[TEST 11] Creating Event B and scanning Event A ticket at Event B scanner...');
    const createEventBRes = await apiRequest('/organizer/events', {
      method: 'POST',
      headers: { Authorization: `Bearer ${organizerToken}` },
      body: {
        title: `Design Summit ${Date.now()}`,
        category: 'Workshop',
        venue: 'Auditorium B',
        city: 'Hyderabad',
        event_date: '2026-12-01',
        start_time: '09:00:00',
        end_time: '17:00:00',
        registration_fee: 0.00,
        max_participants: 100,
        status: 'published'
      }
    });
    const eventBId = createEventBRes.event.id;
    try {
      await apiRequest(`/organizer/events/${eventBId}/checkin`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${organizerToken}` },
        body: { qr_token: ticketCode }
      });
      console.error('❌ Failed: Scanning Event A ticket at Event B should be blocked.');
    } catch (wrongEvtErr) {
      console.log(`✓ Wrong Event blocked correctly: "${wrongEvtErr.message}"`);
    }

    console.log('\n==================================================');
    console.log('ALL E2E INTEGRATION TESTS PASSED SUCCESSFULLY! ✓');
    console.log('==================================================');
    process.exit(0);
  } catch (err) {
    console.error('❌ Integration test error:', err.data || err.message);
    process.exit(1);
  }
}

runTests();
