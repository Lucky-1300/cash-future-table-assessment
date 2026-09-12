const {
  streamCmContractMaster,
  streamFoContractMaster,
  streamCmMarketData,
  streamFoMarketData,
} = require('./services/csvService');

async function testCsvStreams() {
  console.log('====================================================');
  console.log('         TESTING CSV STREAMING SERVICE              ');
  console.log('====================================================\n');

  try {
    // 1. CM Contract Master (sample 3 rows)
    console.log('1️⃣ Testing CM Contract Master (limit: 3 rows)...');
    const cmContractRes = await streamCmContractMaster((row, index) => {
      console.log(`   [Row ${index}] Token: ${row.token}, Symbol: ${row.symbol}, Type: ${row.instrumentType}, Name: ${row.contractName}`);
    }, { limit: 3 });
    console.log(`   ✅ Success: Processed ${cmContractRes.totalRows} rows in ${cmContractRes.durationMs}ms\n`);

    // 2. FO Contract Master (sample 3 rows)
    console.log('2️⃣ Testing FO Contract Master (limit: 3 rows)...');
    const foContractRes = await streamFoContractMaster((row, index) => {
      console.log(`   [Row ${index}] Token: ${row.token}, Symbol: ${row.symbol}, Type: ${row.instrumentType}, Expiry: ${row.expiryDate}, Name: ${row.contractName}`);
    }, { limit: 3 });
    console.log(`   ✅ Success: Processed ${foContractRes.totalRows} rows in ${foContractRes.durationMs}ms\n`);

    // 3. CM Market Data (sample 3 rows)
    console.log('3️⃣ Testing NSECM Market Data (limit: 3 rows)...');
    const cmMarketRes = await streamCmMarketData((row, index) => {
      console.log(`   [Row ${index}] Token: ${row.token}, Timestamp: ${row.timestamp}, Bid: ${row.bidPrice}, Ask: ${row.askPrice}, LTP: ${row.ltp}`);
    }, { limit: 3 });
    console.log(`   ✅ Success: Processed ${cmMarketRes.totalRows} rows in ${cmMarketRes.durationMs}ms\n`);

    // 4. FO Market Data (sample 3 rows)
    console.log('4️⃣ Testing NSEFO Market Data (limit: 3 rows)...');
    const foMarketRes = await streamFoMarketData((row, index) => {
      console.log(`   [Row ${index}] Token: ${row.token}, Timestamp: ${row.timestamp}, Bid: ${row.bidPrice}, Ask: ${row.askPrice}, LTP: ${row.ltp}`);
    }, { limit: 3 });
    console.log(`   ✅ Success: Processed ${foMarketRes.totalRows} rows in ${foMarketRes.durationMs}ms\n`);

    console.log('====================================================');
    console.log('🎉 ALL CSV STREAMING TESTS PASSED SUCCESSFULLY!');
    console.log('====================================================');
  } catch (error) {
    console.error('❌ Error during CSV streaming test:', error.message);
    process.exit(1);
  }
}

testCsvStreams();
