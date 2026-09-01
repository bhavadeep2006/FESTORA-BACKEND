const { pool } = require('../src/config/db');

async function migrateGoogleAuth() {
  console.log('--- STARTING GOOGLE AUTH DATABASE MIGRATION ---');

  try {
    const [cols] = await pool.query('DESCRIBE users');
    const colNames = cols.map(c => c.Field);

    if (!colNames.includes('google_id')) {
      console.log('Adding google_id column to users table...');
      await pool.query('ALTER TABLE users ADD COLUMN google_id VARCHAR(255) NULL AFTER email');
    }

    if (!colNames.includes('auth_provider')) {
      console.log('Adding auth_provider column to users table...');
      await pool.query("ALTER TABLE users ADD COLUMN auth_provider VARCHAR(50) DEFAULT 'local' AFTER google_id");
    }

    if (!colNames.includes('avatar_url')) {
      console.log('Adding avatar_url column to users table...');
      await pool.query('ALTER TABLE users ADD COLUMN avatar_url TEXT NULL AFTER department');
    }

    console.log('✓ Google Auth Migration completed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  }
}

migrateGoogleAuth();
