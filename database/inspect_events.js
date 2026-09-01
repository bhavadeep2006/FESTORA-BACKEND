const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
dotenv.config();

async function inspectColumns() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'root',
    database: process.env.DB_NAME || 'festora'
  });

  const [eventsCols] = await connection.query("DESCRIBE events");
  console.log("EVENTS COLUMNS:", eventsCols.map(c => c.Field));

  const [organizerCols] = await connection.query("DESCRIBE organizers");
  console.log("ORGANIZERS COLUMNS:", organizerCols.map(c => c.Field));

  const [events] = await connection.query("SELECT * FROM events");
  console.log("EVENTS count:", events.length, events);

  await connection.end();
}

inspectColumns().catch(console.error);
