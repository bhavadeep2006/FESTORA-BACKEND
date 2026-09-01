const { pool } = require('../src/config/db');

async function migratePaymentsSchema() {
  console.log('--- STARTING NON-DESTRUCTIVE CASHFREE PAYMENT PREPARATION MIGRATION ---');

  try {
    const [cols] = await pool.query('DESCRIBE registrations');
    const colNames = cols.map(c => c.Field);

    if (!colNames.includes('payment_order_id')) {
      console.log('Adding payment_order_id column to registrations table...');
      await pool.query('ALTER TABLE registrations ADD COLUMN payment_order_id VARCHAR(255) NULL AFTER registration_status');
    }

    if (!colNames.includes('payment_id')) {
      console.log('Adding payment_id column to registrations table...');
      await pool.query('ALTER TABLE registrations ADD COLUMN payment_id VARCHAR(255) NULL AFTER payment_order_id');
    }

    if (!colNames.includes('payment_status')) {
      console.log('Adding payment_status column to registrations table...');
      await pool.query("ALTER TABLE registrations ADD COLUMN payment_status VARCHAR(50) DEFAULT 'FREE' AFTER payment_id");
    }

    if (!colNames.includes('payment_amount')) {
      console.log('Adding payment_amount column to registrations table...');
      await pool.query('ALTER TABLE registrations ADD COLUMN payment_amount DECIMAL(10,2) DEFAULT 0.00 AFTER payment_status');
    }

    console.log('✓ Payment Schema Preparation completed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  }
}

migratePaymentsSchema();
