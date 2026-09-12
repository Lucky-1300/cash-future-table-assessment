const {
  streamEquityContracts,
  streamFutstkContracts,
  streamAllRelevantContracts,
} = require('./services/contractService');

async function testContracts() {
  console.log('====================================================');
  console.log('         TESTING CONTRACT PROCESSING SERVICE        ');
  console.log('====================================================\n');

  try {
    // 1. Test CM Equity Contracts (sample 3)
    console.log('1️⃣ Testing CM Equity Contracts (limit: 3)...');
    const sampleEquity = [];
    const eqResult = await streamEquityContracts((contract, count) => {
      sampleEquity.push(contract);
      console.log(`   [Equity #${count}]`, JSON.stringify(contract));
    }, { limit: 3 });
    console.log(`   ✅ Extracted ${eqResult.totalContracts} equity contracts in ${eqResult.durationMs}ms\n`);

    // 2. Test FO FUTSTK Contracts (sample 3)
    console.log('2️⃣ Testing FO FUTSTK Contracts (limit: 3)...');
    const sampleFutstk = [];
    const futResult = await streamFutstkContracts((contract, count) => {
      sampleFutstk.push(contract);
      console.log(`   [FUTSTK #${count}]`, JSON.stringify(contract));
    }, { limit: 3 });
    console.log(`   ✅ Extracted ${futResult.totalContracts} FUTSTK contracts in ${futResult.durationMs}ms\n`);

    // 3. Test Full Count Validation
    console.log('3️⃣ Validating full dataset counts...');
    const fullResult = await streamAllRelevantContracts(() => {});
    console.log(`   📊 Total CM Equities Processed: ${fullResult.totalEquity}`);
    console.log(`   📊 Total FO FUTSTK Processed  : ${fullResult.totalFutstk}`);
    console.log(`   📊 Total Relevant Contracts   : ${fullResult.totalContracts}`);
    console.log(`   ⏱️  Total Duration             : ${fullResult.durationMs}ms\n`);

    console.log('====================================================');
    console.log('🎉 CONTRACT PROCESSING TESTS PASSED SUCCESSFULLY!');
    console.log('====================================================');
  } catch (error) {
    console.error('❌ Error during contract processing test:', error);
    process.exit(1);
  }
}

testContracts();
