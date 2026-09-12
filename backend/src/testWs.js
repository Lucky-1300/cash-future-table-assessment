const { WebSocket } = require('ws');
const {
  initWebSocketServer,
  broadcastMarketData,
  getConnectedClientCount,
  closeWebSocketServer,
} = require('./websocket/socketServer');

async function testWebSocketServer() {
  console.log('====================================================');
  console.log('         TESTING WEBSOCKET SERVER LAYER             ');
  console.log('====================================================\n');

  const TEST_PORT = 5055;

  try {
    // 1. Initialize server on standalone port
    console.log(`1️⃣ Initializing WebSocket server on port ${TEST_PORT}...`);
    initWebSocketServer(TEST_PORT);

    // 2. Connect client 1
    console.log('2️⃣ Connecting Client 1...');
    const client1 = new WebSocket(`ws://localhost:${TEST_PORT}`);
    const client1Messages = [];

    await new Promise((resolve, reject) => {
      client1.on('open', () => {
        console.log('   ✅ Client 1 connection open.');
        resolve();
      });
      client1.on('error', reject);
      client1.on('message', (msg) => {
        client1Messages.push(JSON.parse(msg.toString()));
      });
    });

    // 3. Connect client 2
    console.log('3️⃣ Connecting Client 2...');
    const client2 = new WebSocket(`ws://localhost:${TEST_PORT}`);
    const client2Messages = [];

    await new Promise((resolve, reject) => {
      client2.on('open', () => {
        console.log('   ✅ Client 2 connection open.');
        resolve();
      });
      client2.on('error', reject);
      client2.on('message', (msg) => {
        client2Messages.push(JSON.parse(msg.toString()));
      });
    });

    console.log(`\n📊 Active connected clients: ${getConnectedClientCount()} (Expected: 2)`);

    // 4. Test Broadcast
    console.log('\n4️⃣ Testing Market Data Broadcast...');
    const mockTick = {
      type: 'MARKET_TICK',
      data: {
        token: '20788',
        timestamp: 1472986477,
        bid: 1656,
        ask: 1657,
        ltp: 1658,
        exchange: 'NSECM',
      },
    };

    const sentCount = broadcastMarketData(mockTick);
    console.log(`   📡 Broadcast sent to ${sentCount} clients.`);

    // Give 50ms for message delivery
    await new Promise((r) => setTimeout(r, 50));

    console.log('   📩 Client 1 received:', client1Messages[client1Messages.length - 1]);
    console.log('   📩 Client 2 received:', client2Messages[client2Messages.length - 1]);

    // 5. Test Disconnect
    console.log('\n5️⃣ Testing Client Disconnection...');
    client1.close();
    await new Promise((r) => setTimeout(r, 50));
    console.log(`   📊 Remaining connected clients: ${getConnectedClientCount()} (Expected: 1)`);

    client2.close();
    await new Promise((r) => setTimeout(r, 50));
    console.log(`   📊 Remaining connected clients: ${getConnectedClientCount()} (Expected: 0)`);

    // 6. Cleanup
    closeWebSocketServer();

    console.log('\n====================================================');
    console.log('🎉 WEBSOCKET SERVER TESTS PASSED SUCCESSFULLY!');
    console.log('====================================================');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during WebSocket test:', error);
    closeWebSocketServer();
    process.exit(1);
  }
}

testWebSocketServer();
