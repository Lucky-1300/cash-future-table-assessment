const pool = require('./db');

async function testNearestExpiry() {
  console.log('--- Checking Symbols With Multiple FUTSTK Expiries ---');
  const qMulti = await pool.query(`
    SELECT c.symbol, count(f.token) as fut_count
    FROM contracts c
    JOIN contracts f ON c.symbol = f.symbol AND f.instrument_type = 'FUTSTK'
    WHERE c.instrument_type = 'EQUITY'
    GROUP BY c.symbol
    HAVING count(f.token) > 1
    ORDER BY count(f.token) DESC
    LIMIT 5;
  `);
  console.log('Sample symbols with multiple FUTSTK expiries in DB:', qMulti.rows);

  console.log('\n--- Executing DISTINCT ON (c.symbol) ORDER BY c.symbol, f.expiry_date ASC ---');
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
    ORDER BY c.symbol, f.expiry_date ASC;
  `);
  console.log(`Total paired stocks: ${qNearest.rows.length}`);

  // Check a symbol with multiple expiries to verify nearest is picked
  if (qMulti.rows.length > 0) {
    const testSym = qMulti.rows[0].symbol;
    const allExpiries = await pool.query(
      `SELECT symbol, token, contract_name, expiry_date FROM contracts WHERE symbol = $1 AND instrument_type = 'FUTSTK' ORDER BY expiry_date ASC;`,
      [testSym]
    );
    console.log(`\nAll FUTSTK expiries for ${testSym}:`, allExpiries.rows);
    const selected = qNearest.rows.find(r => r.symbol === testSym);
    console.log(`Selected nearest expiry for ${testSym}:`, selected);

    const minExpiry = allExpiries.rows[0].expiry_date;
    const isCorrect = selected.fut_expiry === minExpiry;
    console.log(`\nVerification: Is selected expiry (${selected.fut_expiry}) === minimum expiry (${minExpiry})? => ${isCorrect ? '✅ PASSED' : '❌ FAILED'}`);
  }

  // Check that every symbol appears exactly once
  const symbols = qNearest.rows.map(r => r.symbol);
  const uniqueSymbols = new Set(symbols);
  console.log(`\nVerification: Exactly one row per stock? => ${symbols.length === uniqueSymbols.size ? '✅ PASSED (' + symbols.length + ' unique stocks)' : '❌ FAILED'}`);

  await pool.end();
}

testNearestExpiry().catch(e => {
  console.error('Error:', e);
  pool.end();
});
