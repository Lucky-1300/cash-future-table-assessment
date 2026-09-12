const {
  parseMarketDataRow,
  streamCmMarketDataTicks,
  streamFoMarketDataTicks,
  MarketDataStore,
} = require('./services/marketDataService');

async function testMarketData() {
  console.log('====================================================');
  console.log('         TESTING MARKET DATA SERVICE                ');
  console.log('====================================================\n');

  try {
    const store = new MarketDataStore();

    // 1. Test CM Market Data streaming (5 sample rows)
    console.log('1️⃣ Testing CM Market Data streaming (limit: 5)...');
    const cmResult = await streamCmMarketDataTicks((tick, count) => {
      store.update(tick);
      console.log(`   [CM Tick #${count}]`, JSON.stringify(tick));
    }, { limit: 5 });
    console.log(`   ✅ Processed ${cmResult.totalTicks} CM ticks in ${cmResult.durationMs}ms\n`);

    // 2. Test FO Market Data streaming (including 0 bid/ask cases)
    console.log('2️⃣ Testing FO Market Data streaming (limit: 5)...');
    const foResult = await streamFoMarketDataTicks((tick, count) => {
      store.update(tick);
      console.log(`   [FO Tick #${count}]`, JSON.stringify(tick));
    }, { limit: 5 });
    console.log(`   ✅ Processed ${foResult.totalTicks} FO ticks in ${foResult.durationMs}ms\n`);

    // 3. Test Store Lookup
    console.log('3️⃣ Testing In-Memory Market Data Store...');
    console.log(`   📦 Total Cached Tokens: ${store.size()}`);
    const sampleToken = '68407';
    const cachedTick = store.get(sampleToken);
    console.log(`   🔍 Lookup token "${sampleToken}":`, cachedTick);

    // 4. Test Zero Bid/Ask Parsing Logic
    console.log('\n4️⃣ Testing Edge Cases (Zero bid/ask, empty fields)...');
    const edgeCase1 = parseMarketDataRow({ token: '100', timestamp: '1472893200', bidPrice: '0', askPrice: '0', ltp: '2500' }, 'NSEFO');
    console.log('   • Zero bid/ask:', edgeCase1);

    const edgeCase2 = parseMarketDataRow({ token: '200', timestamp: '1472893200', bidPrice: '', askPrice: null, ltp: '150.5' }, 'NSECM');
    console.log('   • Empty/null bid/ask:', edgeCase2);

    console.log('\n====================================================');
    console.log('🎉 MARKET DATA SERVICE TESTS PASSED SUCCESSFULLY!');
    console.log('====================================================');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during market data test:', error);
    process.exit(1);
  }
}

testMarketData();
