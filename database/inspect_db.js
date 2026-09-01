const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
dotenv.config();

async function inspectData() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'root',
    database: process.env.DB_NAME || 'festora'
  });

  const [organizers] = await connection.query("SELECT id, name, email, organization_name, created_at FROM organizers");
  console.log("ORGANIZERS:", JSON.stringify(organizers, null, 2));

  const [events] = await connection.query("SELECT id, title, organizer_id, category, date FROM events");
  console.log("EVENTS:", JSON.stringify(events, null, 2));

  const [users] = await connection.query("SELECT id, name, email FROM users");
  console.log("USERS:", JSON.stringify(users, null, 2));

  const [regs] = await connection.query("SELECT id, user_id, event_id FROM registrations");
  console.log("REGISTRATIONS:", JSON.stringify(regs, null, 2));

  await connection.end();
}

inspectData().catch(console.error);
