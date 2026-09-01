const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config();

async function verify() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'root',
    database: process.env.DB_NAME || 'festora'
  });

  const [tables] = await connection.query("SHOW TABLES;");
  const tableNames = tables.map(row => Object.values(row)[0]);

  console.log("Found Tables (" + tableNames.length + "):", tableNames.join(", "));

  let totalRows = 0;
  for (const name of tableNames) {
    const [rows] = await connection.query(`SELECT COUNT(*) as count FROM \`${name}\``);
    const count = rows[0].count;
    totalRows += count;
    console.log(`Table '${name}': ${count} rows`);
  }

  // Check Foreign Keys
  const [fkRows] = await connection.query(`
    SELECT TABLE_NAME, COLUMN_NAME, CONSTRAINT_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
    FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = 'festora' AND REFERENCED_TABLE_NAME IS NOT NULL;
  `);

  console.log("\nForeign Key Constraints (" + fkRows.length + "):");
  fkRows.forEach(fk => {
    console.log(` - ${fk.TABLE_NAME}.${fk.COLUMN_NAME} -> ${fk.REFERENCED_TABLE_NAME}.${fk.REFERENCED_COLUMN_NAME} (${fk.CONSTRAINT_NAME})`);
  });

  console.log("\nTotal rows across all tables:", totalRows);
  await connection.end();
}

verify().catch(console.error);
