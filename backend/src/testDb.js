const pool = require('./db');

async function testDatabaseConnection() {
  console.log('--- Testing PostgreSQL Database Connection ---');
  let client;
  let hasError = false;

  try {
    client = await pool.connect();
    console.log('✅ Successfully connected to PostgreSQL client.');

    // 1. Basic connection and metadata query
    const res = await client.query('SELECT NOW() AS current_time, current_database() AS database_name, current_user AS user_name;');
    const row = res.rows[0];
    console.log(`📊 Connected Database : ${row.database_name}`);
    console.log(`👤 Connected User     : ${row.user_name}`);
    console.log(`🕒 Server Time        : ${row.current_time}`);

    // 2. Check contracts table
    try {
      const tableCheck = await client.query('SELECT COUNT(*) AS total_contracts FROM contracts;');
      console.log(`📋 "contracts" Table   : Found (${tableCheck.rows[0].total_contracts} rows)`);
    } catch (tableErr) {
      console.warn(`⚠️ Note on "contracts" table: ${tableErr.message}`);
    }

    console.log('-----------------------------------------------');
    console.log('🎉 Database connection test passed successfully!');
  } catch (err) {
    hasError = true;
    console.error('❌ Database connection failed!');
    console.error(`Error details: ${err.message}`);
    if (!process.env.DB_PASSWORD) {
      console.warn('\n👉 Hint: DB_PASSWORD is empty. Please set your PostgreSQL password in backend/.env:');
      console.warn('   DB_PASSWORD=your_actual_password\n');
    }
  } finally {
    if (client) {
      client.release();
    }
    await pool.end();
    process.exit(hasError ? 1 : 0);
  }
}

testDatabaseConnection();
