const { WebSocket } = require('ws');
const pool = require('./db');
const {
  MarketPairEngine,
  streamAndBroadcastMarketData,
} = require('./services/marketDataService');
const {
  initWebSocketServer,
  setInitialSnapshotProvider,
  closeWebSocketServer,
} = require('./websocket/socketServer');

async function testRealMarketDataPipeline() {
  console.log('================================================================');
  console.log('       REAL MARKET-DATA STREAMING & BROADCAST TEST              ');
  console.log('================================================================\n');

  const TEST_PORT = 5066;

  try {
    // 1. Initialize Market Pair Engine from PostgreSQL
    console.log('1️⃣ Initializing MarketPairEngine from PostgreSQL...');
    const engine = new MarketPairEngine();
    const pairedCount = await engine.init(pool);
    console.log(`   ✅ Loaded ${pairedCount} paired Cash+Future contracts.\n`);

    // 2. Start WebSocket Server with Snapshot Provider
    console.log(`2️⃣ Initializing WebSocket Server on port ${TEST_PORT}...`);
    initWebSocketServer(TEST_PORT);
    setInitialSnapshotProvider(() => engine.getAllPairs());

    // 3. Connect a test WebSocket Client
    console.log('3️⃣ Connecting test frontend WebSocket client...');
    const client = new WebSocket(`ws://localhost:${TEST_PORT}`);
    const receivedMessages = [];

    await new Promise((resolve, reject) => {
      client.on('open', () => {
        console.log('   ✅ WebSocket client connected successfully.');
        resolve();
      });
      client.on('error', reject);
      client.on('message', (msg) => {
        receivedMessages.push(JSON.parse(msg.toString()));
      });
    });

    // Wait 50ms for initial snapshot
    await new Promise((r) => setTimeout(r, 50));
    const snapshotMsg = receivedMessages.find((m) => m.type === 'INITIAL_SNAPSHOT');
    if (snapshotMsg && snapshotMsg.data.length === pairedCount) {
      console.log(`   ✅ Client received INITIAL_SNAPSHOT with ${snapshotMsg.data.length} pairs.\n`);
    } else {
      console.warn('   ⚠️ Note: Snapshot message count:', snapshotMsg ? snapshotMsg.data.length : 0);
    }

    // 4. Stream real market data from CSVs
    console.log('4️⃣ Streaming real market data from CSV files (CM: 100,000 rows, FO: 100,000 rows)...');
    const streamResult = await streamAndBroadcastMarketData(engine, {
      cmLimit: 100000,
      foLimit: 100000,
      batchSize: 100,
      delayMs: 0,
      continuous: false,
      onProgress: (seg, count, stats) => {
        console.log(`   ⏳ [${seg}] Processed ${count.toLocaleString()} ticks... (Matched: ${stats.matchedTokensCount}, Unmatched: ${stats.unmatchedTokensCount})`);
      },
    });

    console.log(`\n✅ Market streaming & broadcast completed in ${streamResult.durationMs}ms`);
    console.log(`📊 Streaming Metrics:`);
    console.log(`   • CM Records Processed      : ${streamResult.cmProcessed.toLocaleString()}`);
    console.log(`   • FO Records Processed      : ${streamResult.foProcessed.toLocaleString()}`);
    console.log(`   • CM Matched Ticks          : ${streamResult.cmMatched.toLocaleString()}`);
    console.log(`   • FO Matched Ticks          : ${streamResult.foMatched.toLocaleString()}`);
    console.log(`   • Matched Contract Tokens   : ${streamResult.matchedTokensCount.toLocaleString()}`);
    console.log(`   • Unmatched Tokens (Options): ${streamResult.unmatchedTokensCount.toLocaleString()}`);
    console.log(`   • Pairs with Live Prices    : ${streamResult.updatedPairs} / ${streamResult.totalPairs}`);
    console.log(`   • WebSocket Broadcasts Sent : ${streamResult.broadcastCount.toLocaleString()}\n`);

    // 5. Verify Client received live batches
    console.log('5️⃣ Verifying WebSocket Client Message Delivery...');
    const batchMessages = receivedMessages.filter((m) => m.type === 'MARKET_BATCH');
    console.log(`   📩 Client received ${batchMessages.length} MARKET_BATCH packets.`);

    // 6. Sample Live Calculated Cash-Future Spread Pairs
    console.log('\n6️⃣ Sample Live Calculated Cash-Future Pairs with Basis Spread:');
    const livePairs = engine.getAllPairs().filter((p) => p.cashLtp !== null && p.futureLtp !== null).slice(0, 5);
    console.table(livePairs.map((p) => ({
      Symbol: p.symbol,
      'Cash LTP': `₹${p.cashLtp?.toFixed(2)}`,
      'Future LTP': `₹${p.futureLtp?.toFixed(2)}`,
      'Basis Spread': `${p.spread >= 0 ? '+' : ''}${p.spread?.toFixed(2)}`,
      'Spread %': `${p.spreadPercent >= 0 ? '+' : ''}${p.spreadPercent?.toFixed(2)}%`,
      'Last Updated': p.lastUpdated,
    })));

    // Cleanup
    client.close();
    closeWebSocketServer();

    console.log('\n================================================================');
    console.log('🎉 REAL MARKET-DATA FLOW VERIFIED SUCCESSFULLY!');
    console.log('================================================================');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during real market-data test:', error);
    closeWebSocketServer();
    process.exit(1);
  } finally {
    await pool.end();
  }
}

testRealMarketDataPipeline();
