const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config();

const isProduction = process.env.NODE_ENV === 'production';
const dbHost = process.env.DB_HOST || 'localhost';
const dbPort = process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 3306;

const useSSL = isProduction ||
  process.env.DB_SSL === 'true' ||
  process.env.DB_SSL === 'REQUIRED' ||
  (dbHost && dbHost.includes('aivencloud.com')) ||
  (dbPort !== 3306);

const poolConfig = {
  host: dbHost,
  port: dbPort,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'festora',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

if (useSSL) {
  poolConfig.ssl = {
    rejectUnauthorized: false
  };
}

const pool = mysql.createPool(poolConfig);

const checkDatabaseConnection = async () => {
  try {
    const connection = await pool.getConnection();
    await connection.ping();
    connection.release();
    return { success: true };
  } catch (error) {
    console.error('[DB CONNECTION FAIL] Host:', dbHost, 'Port:', dbPort, 'User:', process.env.DB_USER, 'DB:', process.env.DB_NAME, 'SSL:', useSSL, 'Error:', error.code || error.message);
    return { success: false, error: error.message };
  }
};

module.exports = {
  pool,
  checkDatabaseConnection
};

