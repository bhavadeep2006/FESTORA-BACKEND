const { pool } = require('../src/config/db');

async function migrate() {
  try {
    console.log('Migrating host_requests schema...');

    // Add event_id column if not exists
    const [cols] = await pool.query('SHOW COLUMNS FROM host_requests');
    const colNames = cols.map(c => c.Field);

    if (!colNames.includes('event_id')) {
      await pool.query('ALTER TABLE host_requests ADD COLUMN event_id INT DEFAULT NULL');
      console.log('Added event_id column to host_requests.');
    }

    if (!colNames.includes('rejection_reason')) {
      await pool.query('ALTER TABLE host_requests ADD COLUMN rejection_reason TEXT DEFAULT NULL');
      console.log('Added rejection_reason column to host_requests.');
    }

    console.log('host_requests schema migration complete!');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

migrate();
