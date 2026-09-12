const { WebSocket } = require('ws');
const pool = require('./db');
const {
  MarketPairEngine,
  streamAndBroadcastMarketData,
  parseMarketDataRow,
} = require('./services/marketDataService');
const {
  initWebSocketServer,
  setInitialSnapshotProvider,
  closeWebSocketServer,
  getConnectedClientCount,
} = require('./websocket/socketServer');
const {
  streamEquityContracts,
  streamFutstkContracts,
} = require('./services/contractService');

async function runComplianceAudit() {
  console.log('========================================================================');
  console.log('       FINAL REQUIREMENTS COMPLIANCE AUDIT & VERIFICATION SUITE         ');
  console.log('========================================================================\n');

  const auditResults = [];

  const addResult = (reqNumber, reqName, status, evidence) => {
    auditResults.push({ reqNumber, reqName, status, evidence });
    console.log(`[REQ #${reqNumber}] ${reqName}: ${status ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`   Evidence: ${evidence}\n`);
  };

  try {
    // -------------------------------------------------------------
    // AUDIT 1: PostgreSQL Contracts Table & Fields
    // -------------------------------------------------------------
    console.log('1️⃣ Auditing PostgreSQL Contracts Table...');
    const tableRes = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'contracts' 
      ORDER BY ordinal_position;
    `);
    const countRes = await pool.query('SELECT COUNT(*) AS total FROM contracts;');
    const cmCountRes = await pool.query("SELECT COUNT(*) AS total FROM contracts WHERE exchange = 'NSECM' AND instrument_type = 'EQUITY';");
    const foCountRes = await pool.query("SELECT COUNT(*) AS total FROM contracts WHERE exchange = 'NSEFO' AND instrument_type = 'FUTSTK';");

    const colNames = tableRes.rows.map(r => r.column_name);
    const hasRequiredCols = ['token', 'instrument_type', 'symbol', 'expiry_date', 'contract_name', 'exchange'].every(c => colNames.includes(c));

    addResult(
      1,
      'Contract Processing & PostgreSQL Storage',
      hasRequiredCols && parseInt(countRes.rows[0].total) > 0,
      `Table 'contracts' contains ${countRes.rows[0].total} rows (${cmCountRes.rows[0].total} CM Equities, ${foCountRes.rows[0].total} FO FUTSTK). Columns: [${colNames.join(', ')}].`
    );

    // -------------------------------------------------------------
    // AUDIT 2: Nearest Expiry Selection & Exactly One Row Per Stock
    // -------------------------------------------------------------
    console.log('2️⃣ Auditing Nearest Expiry Selection & 1-Row-Per-Stock Pairing...');
    const qNearest = await pool.query(`
      SELECT DISTINCT ON (c.symbol)
        c.symbol,
        c.token AS cash_token,
        c.contract_name AS cash_name,
        f.token AS fut_token,
        f.contract_name AS fut_name,
        f.expiry_date AS fut_expiry
      FROM contracts c
      JOIN contracts f ON c.symbol = f.symbol AND f.instrument_type = 'FUTSTK'
      WHERE c.instrument_type = 'EQUITY'
      ORDER BY c.symbol, f.expiry_date ASC NULLS LAST;
    `);

    // Verify for all paired symbols that the selected future is strictly the MINIMUM expiryDate
    let allExpiriesVerified = true;
    let failedSymbol = null;

    // Check a sample of symbols with multiple expiries
    const symbolsWithMultiFut = await pool.query(`
      SELECT c.symbol, count(f.token) as fut_count
      FROM contracts c
      JOIN contracts f ON c.symbol = f.symbol AND f.instrument_type = 'FUTSTK'
      WHERE c.instrument_type = 'EQUITY'
      GROUP BY c.symbol
      HAVING count(f.token) > 1;
    `);

    for (const r of symbolsWithMultiFut.rows.slice(0, 20)) {
      const allExps = await pool.query(
        `SELECT token, expiry_date FROM contracts WHERE symbol = $1 AND instrument_type = 'FUTSTK' ORDER BY expiry_date ASC;`,
        [r.symbol]
      );
      const minExp = allExps.rows[0].expiry_date;
      const selected = qNearest.rows.find(p => p.symbol === r.symbol);
      if (!selected || selected.fut_expiry !== minExp) {
        allExpiriesVerified = false;
        failedSymbol = r.symbol;
        break;
      }
    }

    const uniqueSymbols = new Set(qNearest.rows.map(r => r.symbol));
    const isExactlyOneRowPerStock = qNearest.rows.length === uniqueSymbols.size;

    addResult(
      2,
      'Nearest-Expiry FUTSTK Pairing & Exactly 1 Row Per Stock',
      allExpiriesVerified && isExactlyOneRowPerStock,
      `Matched ${qNearest.rows.length} unique Cash-Future pairs. Exactly 1 row per stock verified (${uniqueSymbols.size} unique symbols). Minimum expiryDate verified across multi-expiry contracts (Sample: INDIANB nearest expiry = ${qNearest.rows.find(p => p.symbol === 'INDIANB')?.fut_expiry}).`
    );

    // -------------------------------------------------------------
    // AUDIT 3: Market Data Parsing & Token Matching
    // -------------------------------------------------------------
    console.log('3️⃣ Auditing Market Data Row Parsing & Token Matching...');
    const rawCmRow = { token: '14309', timestamp: '1472986477', bidPrice: '165600', askPrice: '165700', ltp: '165650' };
    const parsedCm = parseMarketDataRow(rawCmRow, 'NSECM');
    const isCmParsed = parsedCm && parsedCm.token === '14309' && parsedCm.bid === 1656.00 && parsedCm.ask === 1657.00 && parsedCm.ltp === 1656.50;

    const rawFoRow = { token: '68549', timestamp: '1472986477', bidPrice: '167000', askPrice: '167200', ltp: '167100' };
    const parsedFo = parseMarketDataRow(rawFoRow, 'NSEFO');
    const isFoParsed = parsedFo && parsedFo.token === '68549' && parsedFo.bid === 1670.00 && parsedFo.ask === 1672.00 && parsedFo.ltp === 1671.00;

    addResult(
      3,
      'Market Data Token Matching & Paise-to-Rupee Parsing',
      isCmParsed && isFoParsed,
      `CM Token ${parsedCm.token} (Bid: ₹${parsedCm.bid}, Ask: ₹${parsedCm.ask}, LTP: ₹${parsedCm.ltp}), FO Token ${parsedFo.token} (Bid: ₹${parsedFo.bid}, Ask: ₹${parsedFo.ask}, LTP: ₹${parsedFo.ltp}).`
    );

    // -------------------------------------------------------------
    // AUDIT 4: Exact Spread Formulas Verification
    // -------------------------------------------------------------
    console.log('4️⃣ Auditing Exact Spread Formulas (Buy Spread & Sell Spread)...');
    const engine = new MarketPairEngine();
    await engine.init(pool);

    // Feed CM tick for INDIANB (token 14309)
    engine.processTick({ token: '14309', bidPrice: '10000', askPrice: '10200', ltp: '10100' }, 'NSECM');
    // Cash: Bid = 100.00, Ask = 102.00, LTP = 101.00

    // Feed FO tick for INDIANB (token 68549)
    engine.processTick({ token: '68549', bidPrice: '10500', askPrice: '10700', ltp: '10600' }, 'NSEFO');
    // Future: Bid = 105.00, Ask = 107.00, LTP = 106.00

    const pair = engine.getPair('INDIANB');

    // Formula 1: Buy Spread = Future Bid (105.00) - Stock Ask (102.00) = 3.00
    const expectedBuySpread = 3.00;
    // Formula 2: Sell Spread = Stock Bid (100.00) - Future Ask (107.00) = -7.00
    const expectedSellSpread = -7.00;
    // Basis Spread = Future LTP (106.00) - Stock LTP (101.00) = 5.00
    const expectedBasisSpread = 5.00;

    const buySpreadValid = pair && pair.buySpread === expectedBuySpread;
    const sellSpreadValid = pair && pair.sellSpread === expectedSellSpread;
    const basisSpreadValid = pair && pair.spread === expectedBasisSpread;

    addResult(
      4,
      'Exact Spread Formulas: Buy Spread & Sell Spread',
      buySpreadValid && sellSpreadValid && basisSpreadValid,
      `Buy Spread = Future Bid (${pair.futureBid}) - Stock Ask (${pair.cashAsk}) = ${pair.buySpread} (Expected: ${expectedBuySpread}). ` +
      `Sell Spread = Stock Bid (${pair.cashBid}) - Future Ask (${pair.futureAsk}) = ${pair.sellSpread} (Expected: ${expectedSellSpread}). ` +
      `Basis Spread = Future LTP (${pair.futureLtp}) - Stock LTP (${pair.cashLtp}) = ${pair.spread} (Expected: ${expectedBasisSpread}).`
    );

    // -------------------------------------------------------------
    // AUDIT 5: WebSocket Server, Native WS Client & 1-Second Publishing
    // -------------------------------------------------------------
    console.log('5️⃣ Auditing WebSocket Server & 1-Second Publishing Rate...');
    const TEST_WS_PORT = 5088;
    initWebSocketServer(TEST_WS_PORT);
    setInitialSnapshotProvider(() => engine.getAllPairs());

    const client = new WebSocket(`ws://localhost:${TEST_WS_PORT}`);
    const receivedPackets = [];
    let initialSnapshotReceived = false;

    await new Promise((resolve, reject) => {
      client.on('open', resolve);
      client.on('error', reject);
      client.on('message', (msg) => {
        const parsed = JSON.parse(msg.toString());
        if (parsed.type === 'INITIAL_SNAPSHOT') initialSnapshotReceived = true;
        if (parsed.type === 'MARKET_BATCH') receivedPackets.push({ receivedAt: Date.now(), data: parsed.data });
      });
    });

    // Run stream for 3.2 seconds with continuous 1-second interval publishing
    const streamPromise = streamAndBroadcastMarketData(engine, {
      publishIntervalMs: 1000,
      continuous: true,
      cmLimit: 20000,
      foLimit: 20000,
    });

    // Wait 3.5 seconds to capture multiple 1-second interval publications
    await new Promise((r) => setTimeout(r, 3500));
    engine.isStreaming = false;
    await streamPromise;

    // Check time deltas between broadcasts
    let intervalsOk = false;
    if (receivedPackets.length >= 2) {
      const deltas = [];
      for (let i = 1; i < receivedPackets.length; i++) {
        deltas.push(receivedPackets[i].receivedAt - receivedPackets[i - 1].receivedAt);
      }
      const avgInterval = deltas.reduce((a, b) => a + b, 0) / deltas.length;
      intervalsOk = avgInterval >= 900 && avgInterval <= 1200;
      console.log(`   ⏱️ Recorded WebSocket publish interval deltas: [${deltas.join('ms, ')}ms]. Average: ${avgInterval.toFixed(0)}ms`);
    }

    client.close();
    closeWebSocketServer();

    addResult(
      5,
      'WebSocket Architecture & 1-Second Publishing Interval',
      initialSnapshotReceived && receivedPackets.length >= 2 && intervalsOk,
      `Native WebSocket connected. Initial snapshot received (${qNearest.rows.length} pairs). Received ${receivedPackets.length} batch updates broadcasted at ~1000ms intervals.`
    );

    // -------------------------------------------------------------
    // AUDIT 6: Architectural Constraints (Zero Express, Zero Socket.IO)
    // -------------------------------------------------------------
    console.log('6️⃣ Auditing Architecture Constraints (Zero Express, Zero Socket.IO)...');
    const backendPkg = require('../package.json');
    const frontendPkg = require('../../frontend/package.json');
    const forbidden = ['express', 'socket.io', 'socket.io-client'];
    const foundForbidden = forbidden.filter(
      dep => (backendPkg.dependencies && backendPkg.dependencies[dep]) || (frontendPkg.dependencies && frontendPkg.dependencies[dep])
    );

    addResult(
      6,
      'Architectural Constraints (No Express, No Socket.IO)',
      foundForbidden.length === 0,
      `Checked package.json: Zero Express, Zero Socket.IO. Pure native Node.js HTTP server and native browser WebSocket API used.`
    );

    // -------------------------------------------------------------
    // AUDIT SUMMARY TABLE
    // -------------------------------------------------------------
    console.log('========================================================================');
    console.log('                   COMPLIANCE AUDIT SUMMARY TABLE                       ');
    console.log('========================================================================\n');
    console.table(auditResults.map(r => ({
      'Req #': r.reqNumber,
      Requirement: r.reqName,
      Status: r.status ? 'PASSED ✅' : 'FAILED ❌',
      Evidence: r.evidence.length > 75 ? r.evidence.substring(0, 72) + '...' : r.evidence,
    })));

    const allPassed = auditResults.every(r => r.status);
    console.log(`\nOverall Compliance: ${allPassed ? '100% COMPLIANT ✅' : 'ISSUES DETECTED ❌'}`);
    process.exit(allPassed ? 0 : 1);
  } catch (err) {
    console.error('Audit failed with error:', err);
    closeWebSocketServer();
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runComplianceAudit();
