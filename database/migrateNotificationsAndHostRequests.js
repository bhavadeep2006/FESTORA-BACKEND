const { pool } = require('../src/config/db');

async function migrate() {
  try {
    console.log('Starting migration for notifications and host_requests tables...');

    // 1. Create notifications table if not exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        recipient_id BIGINT NULL,
        type VARCHAR(100) NOT NULL DEFAULT 'event_host_request',
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        reference_id BIGINT NULL,
        reference_type VARCHAR(100) NULL DEFAULT 'host_event_request',
        is_read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_notifications_recipient (recipient_id),
        INDEX idx_notifications_is_read (is_read)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('✓ notifications table verified/created');

    // 2. Ensure host_requests table exists with all required fields
    await pool.query(`
      CREATE TABLE IF NOT EXISTS host_requests (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        phone VARCHAR(50),
        college_or_organization VARCHAR(255) NOT NULL,
        role VARCHAR(255),
        city VARCHAR(100),
        event_name VARCHAR(255) NOT NULL,
        category VARCHAR(100),
        event_description TEXT,
        preferred_date VARCHAR(100),
        expected_participants VARCHAR(100),
        additional_message TEXT,
        social_link VARCHAR(512),
        status ENUM('pending', 'contacted', 'approved', 'rejected') DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_host_requests_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('✓ host_requests table verified/created');

    // Add optional columns to host_requests if table existed prior
    const [cols] = await pool.query('SHOW COLUMNS FROM host_requests');
    const existingFields = cols.map(c => c.Field);

    if (!existingFields.includes('role')) {
      await pool.query('ALTER TABLE host_requests ADD COLUMN role VARCHAR(255) AFTER college_or_organization');
      console.log('✓ Added role column to host_requests');
    }
    if (!existingFields.includes('city')) {
      await pool.query('ALTER TABLE host_requests ADD COLUMN city VARCHAR(100) AFTER role');
      console.log('✓ Added city column to host_requests');
    }
    if (!existingFields.includes('category')) {
      await pool.query('ALTER TABLE host_requests ADD COLUMN category VARCHAR(100) AFTER event_name');
      console.log('✓ Added category column to host_requests');
    }
    if (!existingFields.includes('social_link')) {
      await pool.query('ALTER TABLE host_requests ADD COLUMN social_link VARCHAR(512) AFTER additional_message');
      console.log('✓ Added social_link column to host_requests');
    }

    console.log('Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

migrate();
