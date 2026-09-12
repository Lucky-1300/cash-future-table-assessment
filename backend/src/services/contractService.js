const pool = require('../db');
const {
  streamCmContractMaster,
  streamFoContractMaster,
} = require('./csvService');

/**
 * Validates and transforms a raw CM contract master row into a standardized contract object.
 * Returns null if the row is not an EQUITY instrument.
 * 
 * @param {object} row - Raw row object from CM CSV stream
 * @returns {{ token: string, instrument_type: string, symbol: string, expiry_date: number|null, contract_name: string, exchange: string } | null}
 */
function parseCmEquityContract(row) {
  if (!row || !row.token) return null;

  const instrumentType = (row.instrumentType || '').trim().toUpperCase();
  if (instrumentType !== 'EQUITY') {
    return null;
  }

  const rawExpiry = parseInt(row.expiryDate, 10);
  const expiryDate = Number.isInteger(rawExpiry) && rawExpiry > 0 ? rawExpiry : null;

  return {
    token: row.token.toString().trim(),
    instrument_type: instrumentType,
    symbol: (row.symbol || '').trim(),
    expiry_date: expiryDate,
    contract_name: (row.contractName || row.symbol || '').trim(),
    exchange: 'NSECM',
  };
}

/**
 * Validates and transforms a raw FO contract master row into a standardized contract object.
 * Returns null if the row is not a FUTSTK instrument.
 * 
 * @param {object} row - Raw row object from FO CSV stream
 * @returns {{ token: string, instrument_type: string, symbol: string, expiry_date: number|null, contract_name: string, exchange: string } | null}
 */
function parseFoFutstkContract(row) {
  if (!row || !row.token) return null;

  const instrumentType = (row.instrumentType || '').trim().toUpperCase();
  if (instrumentType !== 'FUTSTK') {
    return null;
  }

  const rawExpiry = parseInt(row.expiryDate, 10);
  const expiryDate = Number.isInteger(rawExpiry) && rawExpiry > 0 ? rawExpiry : null;

  return {
    token: row.token.toString().trim(),
    instrument_type: instrumentType,
    symbol: (row.symbol || '').trim(),
    expiry_date: expiryDate,
    contract_name: (row.contractName || `${(row.symbol || '').trim()} FUT`).trim(),
    exchange: 'NSEFO',
  };
}

/**
 * Streams only EQUITY contracts from the CM contract master CSV.
 * 
 * @param {function} onContract - Callback for each valid equity contract: onContract(contract, count)
 * @param {object} options - Optional { limit, filePath }
 * @returns {Promise<{ totalContracts: number, durationMs: number }>}
 */
async function streamEquityContracts(onContract, options = {}) {
  const { limit = Infinity, filePath } = options;
  let count = 0;
  const startTime = Date.now();

  await streamCmContractMaster(async (row) => {
    if (count >= limit) return false;

    const contract = parseCmEquityContract(row);
    if (contract) {
      count++;
      if (typeof onContract === 'function') {
        const res = await onContract(contract, count);
        if (res === false) return false;
      }
      if (count >= limit) return false;
    }
  }, { filePath });

  return {
    totalContracts: count,
    durationMs: Date.now() - startTime,
  };
}

/**
 * Streams only FUTSTK contracts from the FO contract master CSV.
 * 
 * @param {function} onContract - Callback for each valid FUTSTK contract: onContract(contract, count)
 * @param {object} options - Optional { limit, filePath }
 * @returns {Promise<{ totalContracts: number, durationMs: number }>}
 */
async function streamFutstkContracts(onContract, options = {}) {
  const { limit = Infinity, filePath } = options;
  let count = 0;
  const startTime = Date.now();

  await streamFoContractMaster(async (row) => {
    if (count >= limit) return false;

    const contract = parseFoFutstkContract(row);
    if (contract) {
      count++;
      if (typeof onContract === 'function') {
        const res = await onContract(contract, count);
        if (res === false) return false;
      }
      if (count >= limit) return false;
    }
  }, { filePath });

  return {
    totalContracts: count,
    durationMs: Date.now() - startTime,
  };
}

/**
 * Streams both CM Equity contracts and FO FUTSTK contracts in sequence.
 * 
 * @param {function} onContract - Callback for each valid contract: onContract(contract, count, type)
 * @param {object} options - Optional { equityLimit, futstkLimit, cmFilePath, foFilePath }
 * @returns {Promise<{ totalEquity: number, totalFutstk: number, totalContracts: number, durationMs: number }>}
 */
async function streamAllRelevantContracts(onContract, options = {}) {
  const startTime = Date.now();
  let globalCount = 0;

  const equityRes = await streamEquityContracts(async (contract) => {
    globalCount++;
    if (typeof onContract === 'function') {
      const res = await onContract(contract, globalCount, 'EQUITY');
      if (res === false) return false;
    }
  }, { limit: options.equityLimit, filePath: options.cmFilePath });

  const futstkRes = await streamFutstkContracts(async (contract) => {
    globalCount++;
    if (typeof onContract === 'function') {
      const res = await onContract(contract, globalCount, 'FUTSTK');
      if (res === false) return false;
    }
  }, { limit: options.futstkLimit, filePath: options.foFilePath });

  return {
    totalEquity: equityRes.totalContracts,
    totalFutstk: futstkRes.totalContracts,
    totalContracts: globalCount,
    durationMs: Date.now() - startTime,
  };
}

/**
 * Inserts a batch of contract records using parameterized queries and UPSERT handling.
 * Ensures the query is strictly awaited before returning.
 * 
 * @param {object} client - Active PostgreSQL client instance (from Pool)
 * @param {Array<object>} batch - Array of standardized contract objects
 * @returns {Promise<number>} - Count of inserted rows in batch
 */
async function insertContractBatch(client, batch) {
  if (!batch || batch.length === 0) return 0;

  const valuePlaceholders = [];
  const queryParams = [];

  for (let i = 0; i < batch.length; i++) {
    const offset = i * 6;
    valuePlaceholders.push(
      `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6})`
    );
    const item = batch[i];
    queryParams.push(
      item.token,
      item.instrument_type,
      item.symbol,
      item.expiry_date,
      item.contract_name,
      item.exchange
    );
  }

  const queryText = `
    INSERT INTO contracts (token, instrument_type, symbol, expiry_date, contract_name, exchange)
    VALUES ${valuePlaceholders.join(',\n')}
    ON CONFLICT (token) DO UPDATE SET
      instrument_type = EXCLUDED.instrument_type,
      symbol = EXCLUDED.symbol,
      expiry_date = EXCLUDED.expiry_date,
      contract_name = EXCLUDED.contract_name,
      exchange = EXCLUDED.exchange;
  `;

  await client.query(queryText, queryParams);
  return batch.length;
}

/**
 * Imports contract data (CM Equities + FO FUTSTK) into PostgreSQL using streaming and batch transactions.
 * Strictly awaits every database operation sequentially to eliminate concurrent query collisions on the client.
 * 
 * @param {object} options - Optional config: { batchSize, pool, clearExisting, cmFilePath, foFilePath }
 * @returns {Promise<{ totalInserted: number, cmInserted: number, foInserted: number, durationMs: number }>}
 */
async function importContractsToDatabase(options = {}) {
  const dbPool = options.pool || pool;
  const batchSize = options.batchSize || 500;
  const client = await dbPool.connect();

  const startTime = Date.now();
  let totalInserted = 0;
  let cmInserted = 0;
  let foInserted = 0;
  let currentBatch = [];
  let batchNum = 0;

  try {
    await client.query('BEGIN');

    if (options.clearExisting) {
      console.log('   🗑️ Clearing existing contracts table (TRUNCATE)...');
      await client.query('TRUNCATE TABLE contracts;');
    }

    console.log(`   📦 Streaming records & executing batch inserts (batch size: ${batchSize})...`);

    // Stream and batch insert
    await streamAllRelevantContracts(async (contract, globalIndex, type) => {
      currentBatch.push(contract);

      if (type === 'EQUITY') cmInserted++;
      else if (type === 'FUTSTK') foInserted++;

      if (currentBatch.length >= batchSize) {
        batchNum++;
        const count = await insertContractBatch(client, currentBatch);
        totalInserted += count;
        console.log(`   📥 Batch #${batchNum.toString().padStart(2, '0')}: Inserted ${count} contracts (Total: ${totalInserted} | CM: ${cmInserted}, FO: ${foInserted})`);
        currentBatch = [];
      }
    }, {
      cmFilePath: options.cmFilePath,
      foFilePath: options.foFilePath,
    });

    // Flush any remaining records in final batch
    if (currentBatch.length > 0) {
      batchNum++;
      const count = await insertContractBatch(client, currentBatch);
      totalInserted += count;
      console.log(`   📥 Batch #${batchNum.toString().padStart(2, '0')} (Final): Inserted ${count} contracts (Total: ${totalInserted})`);
      currentBatch = [];
    }

    await client.query('COMMIT');

    return {
      totalInserted,
      cmInserted,
      foInserted,
      durationMs: Date.now() - startTime,
    };
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rbErr) {}
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Fetches contract summary statistics from PostgreSQL.
 * 
 * @param {object} customPool - Optional custom pool instance
 * @returns {Promise<{ total: number, breakdown: Array<object> }>}
 */
async function getContractsSummary(customPool = pool) {
  const totalRes = await customPool.query('SELECT COUNT(*) AS total FROM contracts;');
  const breakdownRes = await customPool.query(`
    SELECT 
      exchange,
      instrument_type,
      COUNT(*) AS count
    FROM contracts
    GROUP BY exchange, instrument_type
    ORDER BY exchange, instrument_type;
  `);

  return {
    total: parseInt(totalRes.rows[0].total, 10),
    breakdown: breakdownRes.rows.map((r) => ({
      exchange: r.exchange,
      instrument_type: r.instrument_type,
      count: parseInt(r.count, 10),
    })),
  };
}

module.exports = {
  parseCmEquityContract,
  parseFoFutstkContract,
  streamEquityContracts,
  streamFutstkContracts,
  streamAllRelevantContracts,
  insertContractBatch,
  importContractsToDatabase,
  getContractsSummary,
};
