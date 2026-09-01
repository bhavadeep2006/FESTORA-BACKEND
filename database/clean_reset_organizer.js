const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
dotenv.config();

async function resetOrganizer() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'root',
    database: process.env.DB_NAME || 'festora'
  });

  console.log('=== CLEAN ORGANIZER RESET ===');

  const targetEmail = 'organizer@festora.demo';
  const rawPassword = 'OrganizerPassword123!';
  const hashedPassword = await bcrypt.hash(rawPassword, 10);

  // 1. Create a temporary organizer to hold foreign keys while deleting old organizers
  const [tempRes] = await connection.query(
    `INSERT INTO organizers (name, email, phone, password_hash, organization_name, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
    ['Temp Hold', 'temp.hold@festora.demo', '+910000000000', hashedPassword, 'Temp Org']
  );
  const tempOrgId = tempRes.insertId;

  // 2. Point all existing events to tempOrgId
  await connection.query(`UPDATE events SET organizer_id = ?`, [tempOrgId]);

  // 3. Remove test events 30, 31, 32 if present
  const [delEvts] = await connection.query(`DELETE FROM events WHERE id IN (30, 31, 32)`);
  console.log(`[RESET] Cleaned up ${delEvts.affectedRows} temp test events`);

  // 4. Delete ALL previous organizers
  const [delOld] = await connection.query(`DELETE FROM organizers WHERE id != ?`, [tempOrgId]);
  console.log(`[RESET] Removed ${delOld.affectedRows} old organizer record(s)`);

  // 5. Insert FRESH organizer account with target email
  const [freshRes] = await connection.query(
    `INSERT INTO organizers (name, email, phone, password_hash, organization_name, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
    ['Festora Organizer', targetEmail, '+919876543210', hashedPassword, 'Festora Events Org']
  );
  const freshOrgId = freshRes.insertId;
  console.log(`[RESET] Fresh organizer created with ID: ${freshOrgId}, Email: ${targetEmail}`);

  // 6. Point main events to freshOrgId
  const [updMain] = await connection.query(`UPDATE events SET organizer_id = ?`, [freshOrgId]);
  console.log(`[RESET] Updated ${updMain.affectedRows} events to point to fresh organizer ID ${freshOrgId}`);

  // 7. Delete temporary hold organizer
  await connection.query(`DELETE FROM organizers WHERE id = ?`, [tempOrgId]);
  console.log(`[RESET] Removed temporary hold organizer`);

  // 8. Verify fresh organizer login and password
  const [rows] = await connection.query(`SELECT * FROM organizers WHERE email = ?`, [targetEmail]);
  if (rows.length === 0) {
    throw new Error('Fresh organizer account verification failed!');
  }

  const freshOrg = rows[0];
  const isValidPass = await bcrypt.compare(rawPassword, freshOrg.password_hash);
  console.log(`[VERIFY] Password bcrypt check: ${isValidPass ? 'SUCCESS' : 'FAILED'}`);

  // 9. Generate and verify JWT
  const jwtSecret = process.env.JWT_SECRET || 'festora_secret_key_2026';
  const token = jwt.sign(
    { id: freshOrg.id, email: freshOrg.email, role: 'organizer' },
    jwtSecret,
    { expiresIn: '24h' }
  );

  const decoded = jwt.verify(token, jwtSecret);
  console.log(`[VERIFY] JWT decoded successfully. ID: ${decoded.id}, Role: ${decoded.role}`);

  await connection.end();
  console.log('=== ORGANIZER RESET COMPLETED SUCCESSFULLY ===');
}

resetOrganizer().catch(err => {
  console.error('[RESET ERROR]', err);
  process.exit(1);
});
