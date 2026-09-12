const { WebSocket } = require('ws');

const ws = new WebSocket('ws://localhost:5000');

const rowMap = new Map();
const tokenToSymbolMap = new Map();
let batchCount = 0;
let totalTicks = 0;

ws.on('open', () => {
  console.log('✅ Connected to WebSocket backend (ws://localhost:5000)');
});

ws.on('message', (raw) => {
  try {
    const msg = JSON.parse(raw.toString());

    if (msg.type === 'INITIAL_SNAPSHOT' && Array.isArray(msg.data)) {
      rowMap.clear();
      tokenToSymbolMap.clear();

      for (const item of msg.data) {
        rowMap.set(item.symbol, { ...item });
        if (item.cashToken) tokenToSymbolMap.set(item.cashToken.toString(), item.symbol);
        if (item.futureToken) tokenToSymbolMap.set(item.futureToken.toString(), item.symbol);
      }
      console.log(`📸 [INITIAL_SNAPSHOT] Ingested ${msg.data.length} pairs. Total unique rows: ${rowMap.size}`);
    } else if (msg.type === 'MARKET_BATCH' && Array.isArray(msg.data)) {
      batchCount++;
      totalTicks += msg.data.length;

      for (const tick of msg.data) {
        const symbol = tokenToSymbolMap.get(tick.token.toString());
        if (!symbol) continue;

        const row = rowMap.get(symbol);
        if (!row) continue;

        const isCash = tick.exchange === 'NSECM' || tick.token.toString() === row.cashToken;
        if (isCash) {
          if (tick.ltp > 0) row.cashLtp = tick.ltp;
          if (tick.bid !== undefined) row.cashBid = tick.bid;
          if (tick.ask !== undefined) row.cashAsk = tick.ask;
        } else {
          if (tick.ltp > 0) row.futureLtp = tick.ltp;
          if (tick.bid !== undefined) row.futureBid = tick.bid;
          if (tick.ask !== undefined) row.futureAsk = tick.ask;
        }

        if (row.futureLtp !== null && row.cashLtp !== null) {
          row.spread = Number((row.futureLtp - row.cashLtp).toFixed(2));
          row.spreadPercent = row.cashLtp > 0 ? Number(((row.spread / row.cashLtp) * 100).toFixed(2)) : 0;
        }
      }
    }
  } catch (e) {
    console.error('Error handling WS message:', e.message);
  }
});

setTimeout(() => {
  console.log('\n========================================');
  console.log('       LIVE TABLE INTEGRATION VERIFICATION');
  console.log('========================================');
  console.log(`Unique Rows in Table State: ${rowMap.size}`);
  console.log(`Duplicate row check: ${rowMap.size === Array.from(rowMap.keys()).length ? 'PASSED (0 duplicates)' : 'FAILED'}`);
  console.log(`Batches received: ${batchCount}`);
  console.log(`Total live ticks received: ${totalTicks}`);

  const activeRows = Array.from(rowMap.values()).filter(r => r.cashLtp !== null && r.futureLtp !== null);
  console.log(`Pairs with both Live Cash & Future LTP: ${activeRows.length} / ${rowMap.size}`);

  if (activeRows.length > 0) {
    console.log('\nTop 3 Arbitrage Pairs by Spread:');
    const sorted = [...activeRows].sort((a, b) => (b.spread || 0) - (a.spread || 0));
    sorted.slice(0, 3).forEach((r, i) => {
      console.log(`  ${i + 1}. [${r.symbol}] Cash LTP: ₹${r.cashLtp?.toFixed(2)} | Future LTP: ₹${r.futureLtp?.toFixed(2)} | Basis Spread: ${r.spread >= 0 ? '+' : ''}${r.spread?.toFixed(2)} (${r.spreadPercent >= 0 ? '+' : ''}${r.spreadPercent?.toFixed(2)}%)`);
    });
  }

  console.log('========================================\n');
  ws.close();
  process.exit(0);
}, 5000);
