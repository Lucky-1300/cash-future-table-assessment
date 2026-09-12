const fs = require('fs');
const path = require('path');

async function testFrontendCompliance() {
  console.log('========================================================================');
  console.log('       FRONTEND AG GRID & WEBSOCKET CLIENT COMPLIANCE AUDIT             ');
  console.log('========================================================================\n');

  let passed = true;

  // 1. Inspect MarketDataTable.jsx
  const tablePath = path.resolve(__dirname, '../../frontend/src/components/MarketTable/MarketDataTable.jsx');
  const tableContent = fs.readFileSync(tablePath, 'utf8');

  console.log('1️⃣ Checking AG Grid Column Definitions in MarketDataTable.jsx...');
  const hasSymbolCol = tableContent.includes("field: 'symbol'") && tableContent.includes("headerName: 'SYMBOL'");
  const hasStockLtpCol = tableContent.includes("field: 'cashLtp'") && (tableContent.includes("headerName: 'STOCK LTP'") || tableContent.includes("STOCK LTP"));
  const hasFutLtpCol = tableContent.includes("field: 'futureLtp'") && (tableContent.includes("headerName: 'FUTURE LTP'") || tableContent.includes("FUTURE LTP"));
  const hasBuySpreadCol = tableContent.includes("field: 'buySpread'") && tableContent.includes("headerName: 'BUY SPREAD'");
  const hasSellSpreadCol = tableContent.includes("field: 'sellSpread'") && tableContent.includes("headerName: 'SELL SPREAD'");

  console.log(`   • Symbol Column Present       : ${hasSymbolCol ? '✅' : '❌'}`);
  console.log(`   • Stock LTP Column Present    : ${hasStockLtpCol ? '✅' : '❌'}`);
  console.log(`   • Future LTP Column Present   : ${hasFutLtpCol ? '✅' : '❌'}`);
  console.log(`   • Buy Spread Column Present   : ${hasBuySpreadCol ? '✅' : '❌'}`);
  console.log(`   • Sell Spread Column Present  : ${hasSellSpreadCol ? '✅' : '❌'}`);

  if (!hasSymbolCol || !hasStockLtpCol || !hasFutLtpCol || !hasBuySpreadCol || !hasSellSpreadCol) {
    passed = false;
  }

  // 2. Inspect useWebSocketMarketData.js
  const hookPath = path.resolve(__dirname, '../../frontend/src/hooks/useWebSocketMarketData.js');
  const hookContent = fs.readFileSync(hookPath, 'utf8');

  console.log('\n2️⃣ Checking WebSocket Hook & Spread Formulas in useWebSocketMarketData.js...');
  const usesNativeWs = hookContent.includes('new WebSocket(');
  const maintainsBuySpread = hookContent.includes('buySpread') && hookContent.includes('futureBid - cashAsk') || hookContent.includes('futureBid - Stock Ask');
  const maintainsSellSpread = hookContent.includes('sellSpread') && hookContent.includes('cashBid - futureAsk') || hookContent.includes('Stock Bid - Future Ask');
  const hasRowMapIndex = hookContent.includes('rowMapRef.current.set(symbol');

  console.log(`   • Native browser WebSocket used: ${usesNativeWs ? '✅' : '❌'}`);
  console.log(`   • Buy Spread formula computed : ${maintainsBuySpread ? '✅' : '❌'}`);
  console.log(`   • Sell Spread formula computed: ${maintainsSellSpread ? '✅' : '❌'}`);
  console.log(`   • O(1) Unique Symbol Indexing : ${hasRowMapIndex ? '✅' : '❌'}`);

  if (!usesNativeWs || !maintainsBuySpread || !maintainsSellSpread || !hasRowMapIndex) {
    passed = false;
  }

  // 3. Inspect MarketDetailDrawer.jsx
  const drawerPath = path.resolve(__dirname, '../../frontend/src/components/MarketDetailDrawer/MarketDetailDrawer.jsx');
  const drawerContent = fs.readFileSync(drawerPath, 'utf8');

  console.log('\n3️⃣ Checking MarketDetailDrawer.jsx Analytics Cards...');
  const hasDrawerBuySpread = drawerContent.includes('BUY SPREAD') && drawerContent.includes('pair.buySpread');
  const hasDrawerSellSpread = drawerContent.includes('SELL SPREAD') && drawerContent.includes('pair.sellSpread');
  const hasDrawerBasisSpread = drawerContent.includes('BASIS SPREAD') && drawerContent.includes('pair.spread');

  console.log(`   • Drawer Buy Spread Card     : ${hasDrawerBuySpread ? '✅' : '❌'}`);
  console.log(`   • Drawer Sell Spread Card    : ${hasDrawerSellSpread ? '✅' : '❌'}`);
  console.log(`   • Drawer Basis Spread Card   : ${hasDrawerBasisSpread ? '✅' : '❌'}`);

  if (!hasDrawerBuySpread || !hasDrawerSellSpread || !hasDrawerBasisSpread) {
    passed = false;
  }

  // 4. Verify Built Assets
  const distHtmlPath = path.resolve(__dirname, '../../frontend/dist/index.html');
  const hasDist = fs.existsSync(distHtmlPath);
  console.log(`\n4️⃣ Checking Production Build Output...`);
  console.log(`   • dist/index.html Exists     : ${hasDist ? '✅' : '❌'}`);

  if (!hasDist) passed = false;

  console.log('\n========================================================================');
  console.log(`Frontend Audit Result: ${passed ? 'ALL CHECKS PASSED ✅' : 'CHECKS FAILED ❌'}`);
  console.log('========================================================================');

  process.exit(passed ? 0 : 1);
}

testFrontendCompliance();
