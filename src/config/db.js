const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config();

const isProduction = process.env.NODE_ENV === 'production';
const dbHost = process.env.DB_HOST || 'localhost';
const dbPort = process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 3306;
const dbUser = process.env.DB_USER || 'root';
const dbPassword = process.env.DB_PASSWORD || '';
const dbName = process.env.DB_NAME || 'festora';

const useSSL = isProduction ||
  process.env.DB_SSL === 'true' ||
  process.env.DB_SSL === 'REQUIRED' ||
  (dbHost && dbHost.includes('aivencloud.com')) ||
  (dbPort !== 3306);

const sslOption = useSSL ? { rejectUnauthorized: false } : false;

const poolConfig = {
  host: dbHost,
  port: dbPort,
  user: dbUser,
  password: dbPassword,
  database: dbName,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  ...(useSSL ? { ssl: sslOption } : {})
};

const pool = mysql.createPool(poolConfig);

const initSchema = async (connection) => {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      full_name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL UNIQUE,
      google_id VARCHAR(255) NULL,
      auth_provider VARCHAR(50) DEFAULT 'local',
      phone VARCHAR(20),
      password_hash VARCHAR(255) NOT NULL,
      college VARCHAR(255),
      year_of_study VARCHAR(50),
      department VARCHAR(255),
      avatar_url TEXT NULL,
      reset_token_hash VARCHAR(255) NULL,
      reset_token_expires_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_users_email (email)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS organizers (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL UNIQUE,
      phone VARCHAR(20),
      password_hash VARCHAR(255) NOT NULL,
      organization_name VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_organizers_email (email)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS events (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      organizer_id BIGINT NOT NULL,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      category VARCHAR(100),
      college_or_organization VARCHAR(255),
      venue VARCHAR(255),
      city VARCHAR(100),
      event_date DATE,
      start_time TIME,
      end_time TIME,
      registration_fee DECIMAL(10, 2) DEFAULT 0.00,
      max_participants INT DEFAULT NULL,
      poster_url VARCHAR(512),
      contact_name VARCHAR(255),
      contact_email VARCHAR(255),
      contact_phone VARCHAR(20),
      rules TEXT,
      eligibility TEXT,
      prize_pool VARCHAR(255),
      registration_type ENUM('individual', 'team') DEFAULT 'individual',
      min_team_size INT DEFAULT 1,
      max_team_size INT DEFAULT 1,
      status ENUM('draft', 'published', 'closed') DEFAULT 'draft',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_events_organizer (organizer_id),
      INDEX idx_events_status (status),
      INDEX idx_events_date (event_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await connection.query(`
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
      event_id BIGINT NULL,
      status ENUM('pending', 'contacted', 'approved', 'rejected') DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_host_requests_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS registrations (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT NOT NULL,
      event_id BIGINT NOT NULL,
      registration_status ENUM('pending', 'confirmed', 'cancelled') DEFAULT 'pending',
      registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT unique_user_event UNIQUE (user_id, event_id),
      INDEX idx_registrations_user (user_id),
      INDEX idx_registrations_event (event_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS payments (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      registration_id BIGINT NOT NULL,
      amount DECIMAL(10, 2) NOT NULL,
      currency VARCHAR(10) DEFAULT 'INR',
      payment_status ENUM('pending', 'paid', 'failed', 'refunded') DEFAULT 'pending',
      payment_gateway VARCHAR(50),
      transaction_id VARCHAR(255) UNIQUE,
      paid_at TIMESTAMP NULL DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_payments_registration (registration_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS tickets (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      registration_id BIGINT NOT NULL,
      ticket_code VARCHAR(100) NOT NULL UNIQUE,
      qr_token VARCHAR(255) NOT NULL UNIQUE,
      ticket_status ENUM('active', 'used', 'cancelled') DEFAULT 'active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_tickets_registration (registration_id),
      INDEX idx_tickets_code (ticket_code)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS checkins (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      ticket_id BIGINT NOT NULL,
      event_id BIGINT NOT NULL,
      scanned_by VARCHAR(255),
      scanned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      status VARCHAR(50) DEFAULT 'success',
      CONSTRAINT unique_ticket_checkin UNIQUE (ticket_id, event_id),
      INDEX idx_checkins_ticket (ticket_id),
      INDEX idx_checkins_event (event_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await connection.query(`
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

  await connection.query(`
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
      INDEX idx_erf_event (event_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS registration_teams (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      registration_id BIGINT NOT NULL,
      team_name VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_rt_registration (registration_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS registration_team_members (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      team_id BIGINT NOT NULL,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL,
      phone VARCHAR(20) DEFAULT NULL,
      is_team_leader TINYINT(1) DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_rtm_team (team_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS registration_field_values (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      registration_id BIGINT NOT NULL,
      field_id BIGINT NOT NULL,
      value TEXT DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_rfv_registration (registration_id),
      INDEX idx_rfv_field (field_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
};

let dbInitialized = false;

const checkDatabaseConnection = async () => {
  let rootConn;
  try {
    const connection = await pool.getConnection();
    await connection.ping();
    if (!dbInitialized) {
      await initSchema(connection);
      dbInitialized = true;
    }
    connection.release();
    return { success: true };
  } catch (error) {
    if (error.code === 'ER_BAD_DB_ERROR' || (error.message && error.message.includes('Unknown database'))) {
      console.log(`[DB SETUP] Database '${dbName}' does not exist on MySQL server. Creating database '${dbName}'...`);
      try {
        rootConn = await mysql.createConnection({
          host: dbHost,
          port: dbPort,
          user: dbUser,
          password: dbPassword,
          ...(useSSL ? { ssl: sslOption } : {})
        });
        await rootConn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
        await rootConn.query(`USE \`${dbName}\`;`);
        await initSchema(rootConn);
        await rootConn.end();
        dbInitialized = true;

        const connection2 = await pool.getConnection();
        await connection2.ping();
        connection2.release();
        console.log(`[DB SETUP] Database '${dbName}' created and schema initialized successfully.`);
        return { success: true };
      } catch (createErr) {
        if (rootConn) await rootConn.end().catch(() => {});
        console.error('[DB SETUP FAIL] Could not create database:', createErr.message);
        return { success: false, error: createErr.message };
      }
    }
    console.error('[DB CONNECTION FAIL] Host:', dbHost, 'Port:', dbPort, 'User:', dbUser, 'DB:', dbName, 'SSL:', useSSL, 'Error:', error.code || error.message);
    return { success: false, error: error.message };
  }
};

module.exports = {
  pool,
  checkDatabaseConnection
};

