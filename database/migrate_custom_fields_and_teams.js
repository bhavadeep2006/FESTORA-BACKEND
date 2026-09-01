const { pool } = require('../src/config/db');

async function migrateCustomFieldsAndTeams() {
  try {
    console.log('[MIGRATION] Starting custom fields & team registration schema update...');

    // 1. Add registration_type, min_team_size, max_team_size to events if not exists
    const [eventsCols] = await pool.query('DESCRIBE events');
    const hasRegType = eventsCols.some(c => c.Field === 'registration_type');
    
    if (!hasRegType) {
      console.log('[MIGRATION] Adding registration_type, min_team_size, max_team_size to events table...');
      await pool.query(`
        ALTER TABLE events 
        ADD COLUMN registration_type ENUM('individual', 'team') DEFAULT 'individual',
        ADD COLUMN min_team_size INT DEFAULT 1,
        ADD COLUMN max_team_size INT DEFAULT 1
      `);
      console.log('✓ Added team registration columns to events table.');
    } else {
      console.log('ℹ events table already has registration_type column.');
    }

    // 2. Create event_registration_fields table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS event_registration_fields (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        event_id BIGINT NOT NULL,
        field_label VARCHAR(255) NOT NULL,
        field_type VARCHAR(50) NOT NULL DEFAULT 'text',
        is_required TINYINT(1) DEFAULT 0,
        placeholder VARCHAR(255) DEFAULT NULL,
        options_json TEXT DEFAULT NULL,
        display_order INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX (event_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    console.log('✓ Created/verified event_registration_fields table.');

    // 3. Create registration_teams table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS registration_teams (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        registration_id BIGINT NOT NULL,
        team_name VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX (registration_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    console.log('✓ Created/verified registration_teams table.');

    // 4. Create registration_team_members table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS registration_team_members (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        team_id BIGINT NOT NULL,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        phone VARCHAR(20) DEFAULT NULL,
        is_team_leader TINYINT(1) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX (team_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    console.log('✓ Created/verified registration_team_members table.');

    // 5. Create registration_field_values table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS registration_field_values (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        registration_id BIGINT NOT NULL,
        field_id BIGINT NOT NULL,
        value TEXT DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX (registration_id),
        INDEX (field_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    console.log('✓ Created/verified registration_field_values table.');

    console.log('[MIGRATION] Migration finished successfully.');
    process.exit(0);
  } catch (err) {
    console.error('[MIGRATION ERROR]:', err);
    process.exit(1);
  }
}

migrateCustomFieldsAndTeams();
