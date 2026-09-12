const { WebSocket } = require('ws');

const ws = new WebSocket('ws://localhost:5000');

let snapshotReceived = false;
let batchCount = 0;
let totalTicks = 0;

console.log('Connecting to ws://localhost:5000...');

ws.on('open', () => {
  console.log('✅ WebSocket connection OPEN.');
});

ws.on('message', (data) => {
  try {
    const msg = JSON.parse(data.toString());
    if (msg.type === 'INITIAL_SNAPSHOT') {
      snapshotReceived = true;
      console.log(`📸 Received INITIAL_SNAPSHOT with ${msg.data.length} pairs. First pair:`, msg.data[0]);
    } else if (msg.type === 'MARKET_BATCH') {
      batchCount++;
      totalTicks += msg.data.length;
      if (batchCount <= 5 || batchCount % 20 === 0) {
        console.log(`📦 Received MARKET_BATCH #${batchCount} with ${msg.data.length} ticks. Sample tick:`, msg.data[0]);
      }
    } else if (msg.type === 'CONNECTION_ACK') {
      console.log(`🤝 Received CONNECTION_ACK: ${msg.message}`);
    }
  } catch (err) {
    console.error('Error parsing msg:', err.message);
  }
});

ws.on('error', (err) => {
  console.error('❌ WebSocket error:', err.message);
});

ws.on('close', (code) => {
  console.log(`🔌 WebSocket closed with code ${code}`);
});

setTimeout(() => {
  console.log('\n--- VERIFICATION SUMMARY ---');
  console.log(`Snapshot received: ${snapshotReceived}`);
  console.log(`Batches received: ${batchCount}`);
  console.log(`Total ticks received: ${totalTicks}`);
  console.log('----------------------------\n');
  ws.close();
  process.exit(0);
}, 6000);
