const { pool } = require('../src/config/db');

async function inspectSchema() {
  try {
    const [tables] = await pool.query('SHOW TABLES');
    console.log('TABLES:', tables);

    for (const t of tables) {
      const tableName = Object.values(t)[0];
      const [columns] = await pool.query(`DESCRIBE ${tableName}`);
      console.log(`\n--- TABLE: ${tableName} ---`);
      console.log(columns.map(c => `${c.Field} (${c.Type}) ${c.Null === 'YES' ? 'NULL' : 'NOT NULL'}`));
    }
    process.exit(0);
  } catch (err) {
    console.error('Error inspecting schema:', err);
    process.exit(1);
  }
}

inspectSchema();
