const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config();

async function runMigration() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'root',
    database: process.env.DB_NAME || 'festora'
  });

  console.log('Running schema migration for reset token columns on users table...');

  // Check if columns exist
  const [columns] = await connection.query("SHOW COLUMNS FROM users LIKE 'reset_token_hash'");
  if (columns.length === 0) {
    await connection.query(`
      ALTER TABLE users
      ADD COLUMN reset_token_hash VARCHAR(255) NULL AFTER department,
      ADD COLUMN reset_token_expires_at TIMESTAMP NULL AFTER reset_token_hash
    `);
    console.log('Columns reset_token_hash and reset_token_expires_at added to users table successfully.');
  } else {
    console.log('Reset token columns already exist on users table.');
  }

  await connection.end();
}

runMigration().catch(err => {
  console.error('Migration error:', err);
  process.exit(1);
});
