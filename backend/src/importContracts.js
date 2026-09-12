const pool = require('./db');
const {
  importContractsToDatabase,
  getContractsSummary,
} = require('./services/contractService');

async function runImport() {
  console.log('====================================================');
  console.log('     IMPORTING CONTRACTS MASTER INTO POSTGRESQL     ');
  console.log('====================================================\n');

  try {
    console.log('⏳ Starting streaming batch import...');
    const result = await importContractsToDatabase({ batchSize: 500 });
    console.log(`\n✅ Import finished in ${result.durationMs}ms`);
    console.log(`📦 Processed & Inserted: ${result.totalInserted} total contracts`);
    console.log(`   • CM Equities : ${result.cmInserted}`);
    console.log(`   • FO Futures  : ${result.foInserted}\n`);

    console.log('--- Verification: Querying Database Summary ---');
    const summary = await getContractsSummary(pool);
    console.log(`📊 Total Contracts in DB: ${summary.total}`);
    console.log('📋 Breakdown by Exchange & Instrument:');
    summary.breakdown.forEach((item) => {
      console.log(`   • ${item.exchange.padEnd(8)} | ${item.instrument_type.padEnd(10)} | ${item.count} contracts`);
    });

    console.log('\n--- Sample Rows from PostgreSQL ---');
    const sample = await pool.query('SELECT * FROM contracts ORDER BY token ASC LIMIT 5;');
    console.table(sample.rows);

    console.log('====================================================');
    console.log('🎉 CONTRACT IMPORT COMPLETED AND VERIFIED!');
    console.log('====================================================');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error during contract import:', error.message);
    if (!process.env.DB_PASSWORD) {
      console.warn('\n👉 Hint: DB_PASSWORD is empty. Please set your password in backend/.env');
    }
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runImport();
