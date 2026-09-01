const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
dotenv.config();

async function inspectRegistrations() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'root',
    database: process.env.DB_NAME || 'festora'
  });

  const [registrations] = await connection.query("SELECT * FROM registrations");
  console.log("REGISTRATIONS:", registrations);

  const [tickets] = await connection.query("SELECT * FROM tickets");
  console.log("TICKETS:", tickets);

  await connection.end();
}

inspectRegistrations().catch(console.error);
