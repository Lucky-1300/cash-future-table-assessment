const {
  streamCmMarketData,
  streamFoMarketData,
} = require('./csvService');
const { broadcastMarketData } = require('../websocket/socketServer');

/**
 * Validates and parses a raw market-data CSV row into a strongly typed tick object.
 * Converts raw price in paise (1/100 INR) to standard INR currency numbers.
 * Safely handles missing/empty values and 0 bid/ask prices.
 * 
 * @param {object} row - Raw row object { token, timestamp, bidPrice, askPrice, ltp }
 * @param {'NSECM'|'NSEFO'} exchange - Exchange segment identifier
 * @returns {{ token: string, timestamp: number|null, bid: number, ask: number, ltp: number, exchange: string } | null}
 */
function parseMarketDataRow(row, exchange = 'NSECM') {
  if (!row || !row.token) return null;

  const rawToken = row.token.toString().trim();
  if (!rawToken) return null;

  const rawTimestamp = parseInt(row.timestamp, 10);
  const rawBid = Number(row.bidPrice !== undefined ? row.bidPrice : row.bid);
  const rawAsk = Number(row.askPrice !== undefined ? row.askPrice : row.ask);
  const rawLtp = Number(row.ltp);

  // Divide raw price in paise by 100 to get Rupee value
  const bid = Number.isFinite(rawBid) ? Number((rawBid / 100).toFixed(2)) : 0;
  const ask = Number.isFinite(rawAsk) ? Number((rawAsk / 100).toFixed(2)) : 0;
  const ltp = Number.isFinite(rawLtp) ? Number((rawLtp / 100).toFixed(2)) : 0;

  return {
    token: rawToken,
    timestamp: Number.isInteger(rawTimestamp) ? rawTimestamp : null,
    bid,
    ask,
    ltp,
    exchange,
  };
}

/**
 * High-performance In-Memory Engine for pairing Cash and Future contracts and maintaining live prices.
 */
class MarketPairEngine {
  constructor() {
    this.pairsMap = new Map(); // Symbol -> Paired Contract Row
    this.tokenToPairMap = new Map(); // Token -> { symbol, isCash }
    this.latestTicks = new Map(); // Token -> latest tick
    this.dirtyPairs = new Map(); // Symbol -> updated pair in current 1s window
    this.isInitialized = false;
    this.isStreaming = false;

    this.metrics = {
      cmProcessed: 0,
      foProcessed: 0,
      cmMatched: 0,
      foMatched: 0,
      matchedTokens: new Set(),
      unmatchedTokens: new Set(),
    };
  }

  /**
   * Initializes the engine by querying paired Cash (EQUITY) and Future (FUTSTK) contracts from PostgreSQL.
   * Uses DISTINCT ON (c.symbol) ... ORDER BY c.symbol, f.expiry_date ASC to guarantee selecting the
   * MINIMUM/NEAREST expiryDate for every stock and exactly one row per stock.
   * 
   * @param {object} pool - PostgreSQL pool instance
   * @returns {Promise<number>} - Count of paired contracts loaded
   */
  async init(pool) {
    const queryText = `
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
    `;

    const res = await pool.query(queryText);
    this.pairsMap.clear();
    this.tokenToPairMap.clear();
    this.latestTicks.clear();
    this.dirtyPairs.clear();

    for (const r of res.rows) {
      const cashToken = r.cash_token.toString().trim();
      const futureToken = r.fut_token.toString().trim();
      const futureExpiry = r.fut_expiry ? parseInt(r.fut_expiry, 10) : null;

      const pair = {
        symbol: r.symbol.trim(),
        cashToken,
        cashContractName: r.cash_name.trim(),
        cashLtp: null,
        cashBid: null,
        cashAsk: null,
        futureToken,
        futureContractName: r.fut_name.trim(),
        futureExpiry,
        futureLtp: null,
        futureBid: null,
        futureAsk: null,
        buySpread: null,   // Buy Spread = Future Bid - Stock Ask
        sellSpread: null,  // Sell Spread = Stock Bid - Future Ask
        spread: null,      // Basis Spread = Future LTP - Stock LTP
        spreadPercent: null,
        lastUpdated: null,
      };

      this.pairsMap.set(pair.symbol, pair);
      this.tokenToPairMap.set(cashToken, { symbol: pair.symbol, isCash: true });
      this.tokenToPairMap.set(futureToken, { symbol: pair.symbol, isCash: false });
    }

    this.isInitialized = true;
    console.log(`📊 [MarketEngine] Initialized with ${this.pairsMap.size} nearest-expiry Cash-Future pairs (${this.tokenToPairMap.size} tokens mapped).`);
    return this.pairsMap.size;
  }

  /**
   * Ingests and processes a single market data row.
   * Calculates live Buy Spread (Future Bid - Stock Ask) and Sell Spread (Stock Bid - Future Ask).
   * 
   * @param {object} rawRow - Raw CSV row object
   * @param {'NSECM'|'NSEFO'} exchange - Exchange segment
   * @returns {{ updatedPair: object, tick: object } | null}
   */
  processTick(rawRow, exchange = 'NSECM') {
    if (exchange === 'NSECM') this.metrics.cmProcessed++;
    else if (exchange === 'NSEFO') this.metrics.foProcessed++;

    const tick = parseMarketDataRow(rawRow, exchange);
    if (!tick) return null;

    this.latestTicks.set(tick.token, tick);

    const mapping = this.tokenToPairMap.get(tick.token);
    if (!mapping) {
      this.metrics.unmatchedTokens.add(tick.token);
      return null;
    }

    this.metrics.matchedTokens.add(tick.token);
    if (exchange === 'NSECM') this.metrics.cmMatched++;
    else if (exchange === 'NSEFO') this.metrics.foMatched++;

    const pair = this.pairsMap.get(mapping.symbol);
    if (!pair) return null;

    if (mapping.isCash) {
      if (Number.isFinite(tick.ltp) && tick.ltp > 0) pair.cashLtp = tick.ltp;
      if (Number.isFinite(tick.bid)) pair.cashBid = tick.bid;
      if (Number.isFinite(tick.ask)) pair.cashAsk = tick.ask;
    } else {
      if (Number.isFinite(tick.ltp) && tick.ltp > 0) pair.futureLtp = tick.ltp;
      if (Number.isFinite(tick.bid)) pair.futureBid = tick.bid;
      if (Number.isFinite(tick.ask)) pair.futureAsk = tick.ask;
    }

    // 1. Buy Spread = Future Bid - Stock Ask (Cash Ask)
    if (Number.isFinite(pair.futureBid) && Number.isFinite(pair.cashAsk) && pair.cashAsk > 0) {
      pair.buySpread = Number((pair.futureBid - pair.cashAsk).toFixed(2));
    } else {
      pair.buySpread = null;
    }

    // 2. Sell Spread = Stock Bid (Cash Bid) - Future Ask
    if (Number.isFinite(pair.cashBid) && Number.isFinite(pair.futureAsk) && pair.futureAsk > 0) {
      pair.sellSpread = Number((pair.cashBid - pair.futureAsk).toFixed(2));
    } else {
      pair.sellSpread = null;
    }

    // 3. Basis Spread = Future LTP - Stock LTP (Cash LTP)
    if (Number.isFinite(pair.futureLtp) && Number.isFinite(pair.cashLtp) && pair.cashLtp > 0) {
      pair.spread = Number((pair.futureLtp - pair.cashLtp).toFixed(2));
      pair.spreadPercent = Number(((pair.spread / pair.cashLtp) * 100).toFixed(2));
    }

    pair.lastUpdated = new Date().toLocaleTimeString();

    // Mark as dirty for the next 1-second WebSocket broadcast
    this.dirtyPairs.set(pair.symbol, { ...pair });

    return { updatedPair: pair, tick };
  }

  // Compatibility helpers
  update(tick) {
    if (!tick || !tick.token) return;
    this.latestTicks.set(tick.token, tick);
  }

  get(token) {
    return this.latestTicks.get(token.toString());
  }

  size() {
    return this.latestTicks.size;
  }

  /**
   * Returns array of all paired contracts.
   * @returns {Array<object>}
   */
  getAllPairs() {
    return Array.from(this.pairsMap.values());
  }

  /**
   * Returns a single paired contract by symbol.
   * @param {string} symbol
   * @returns {object|undefined}
   */
  getPair(symbol) {
    return this.pairsMap.get(symbol);
  }

  /**
   * Flushes and returns all pairs that were updated during the 1-second interval.
   * @returns {Array<object>}
   */
  flushDirtyPairs() {
    if (this.dirtyPairs.size === 0) return [];
    const updates = Array.from(this.dirtyPairs.values());
    this.dirtyPairs.clear();
    return updates;
  }

  /**
   * Returns summary statistics of processed market data.
   */
  getStats() {
    const updatedCount = Array.from(this.pairsMap.values()).filter(
      (p) => p.cashLtp !== null || p.futureLtp !== null
    ).length;

    return {
      totalPairs: this.pairsMap.size,
      updatedPairs: updatedCount,
      cmProcessed: this.metrics.cmProcessed,
      foProcessed: this.metrics.foProcessed,
      cmMatched: this.metrics.cmMatched,
      foMatched: this.metrics.foMatched,
      matchedTokensCount: this.metrics.matchedTokens.size,
      unmatchedTokensCount: this.metrics.unmatchedTokens.size,
    };
  }

  /**
   * Resets metrics counters.
   */
  resetMetrics() {
    this.metrics = {
      cmProcessed: 0,
      foProcessed: 0,
      cmMatched: 0,
      foMatched: 0,
      matchedTokens: new Set(),
      unmatchedTokens: new Set(),
    };
  }
}

/**
 * Streams parsed CM (Cash Market) tick data row-by-row.
 */
async function streamCmMarketDataTicks(onTick, options = {}) {
  const { limit = Infinity, filePath } = options;
  let count = 0;
  const startTime = Date.now();

  await streamCmMarketData((rawRow) => {
    if (count >= limit) return false;

    const tick = parseMarketDataRow(rawRow, 'NSECM');
    if (tick) {
      count++;
      const isReached = count >= limit;
      const res = onTick ? onTick(tick, count) : undefined;
      if (res === false || isReached) return false;
      return res;
    }
  }, { limit, filePath });

  return {
    totalTicks: count,
    durationMs: Date.now() - startTime,
  };
}

/**
 * Streams parsed FO (Futures & Options) tick data row-by-row.
 */
async function streamFoMarketDataTicks(onTick, options = {}) {
  const { limit = Infinity, filePath } = options;
  let count = 0;
  const startTime = Date.now();

  await streamFoMarketData((rawRow) => {
    if (count >= limit) return false;

    const tick = parseMarketDataRow(rawRow, 'NSEFO');
    if (tick) {
      count++;
      const isReached = count >= limit;
      const res = onTick ? onTick(tick, count) : undefined;
      if (res === false || isReached) return false;
      return res;
    }
  }, { limit, filePath });

  return {
    totalTicks: count,
    durationMs: Date.now() - startTime,
  };
}

/**
 * Streams CM and FO market-data CSVs, updates the MarketPairEngine,
 * and publishes latest market state to WebSocket clients at strictly 1-second intervals.
 * 
 * @param {MarketPairEngine} engine - Initialized MarketPairEngine instance
 * @param {object} options - Configuration options { publishIntervalMs, cmLimit, foLimit, cmFilePath, foFilePath, continuous, onProgress }
 * @returns {Promise<object>} - Processed metrics summary
 */
async function streamAndBroadcastMarketData(engine, options = {}) {
  const {
    publishIntervalMs = 1000, // Explicit 1-second publishing requirement
    cmLimit = Infinity,
    foLimit = Infinity,
    cmFilePath,
    foFilePath,
    continuous = true,
    onProgress,
  } = options;

  const startTime = Date.now();
  let broadcastCount = 0;
  let cycle = 0;
  engine.isStreaming = true;

  console.log(`▶ [MarketStream] Starting real market data streaming & 1-second WebSocket publishing (${publishIntervalMs}ms interval)...`);

  // Start the 1-second interval publisher
  const publishInterval = setInterval(() => {
    if (!engine.isStreaming) return;
    const updates = engine.flushDirtyPairs();
    if (updates.length > 0) {
      broadcastMarketData({
        type: 'MARKET_BATCH',
        data: updates,
        timestamp: Date.now(),
      });
      broadcastCount++;
    }
  }, publishIntervalMs);

  try {
    while (engine.isStreaming) {
      cycle++;

      // 1. Stream CM Market Data (NSECM)
      console.log(`   🌊 [Cycle ${cycle}] Streaming CM Market Data (nsecm_market_data.csv)...`);
      await streamCmMarketData(async (rawRow, count) => {
        if (!engine.isStreaming) return false;
        engine.processTick(rawRow, 'NSECM');

        // Pacing yield to prevent CPU starvations and allow 1-second timer to fire smoothly
        if (count % 1000 === 0) {
          await new Promise((resolve) => setTimeout(resolve, 10));
        }

        if (count % 250000 === 0 && typeof onProgress === 'function') {
          onProgress('CM', count, engine.getStats());
        }
      }, { limit: cmLimit, filePath: cmFilePath });

      console.log(`   ✅ [Cycle ${cycle}] CM Market Data stream cycle complete (${engine.metrics.cmProcessed.toLocaleString()} rows processed).`);

      // 2. Stream FO Market Data (NSEFO)
      console.log(`   🌊 [Cycle ${cycle}] Streaming FO Market Data (nsefo_market_data.csv)...`);
      await streamFoMarketData(async (rawRow, count) => {
        if (!engine.isStreaming) return false;
        engine.processTick(rawRow, 'NSEFO');

        // Pacing yield to prevent CPU starvations and allow 1-second timer to fire smoothly
        if (count % 1000 === 0) {
          await new Promise((resolve) => setTimeout(resolve, 10));
        }

        if (count % 250000 === 0 && typeof onProgress === 'function') {
          onProgress('FO', count, engine.getStats());
        }
      }, { limit: foLimit, filePath: foFilePath });

      console.log(`   ✅ [Cycle ${cycle}] FO Market Data stream cycle complete (${engine.metrics.foProcessed.toLocaleString()} rows processed).`);

      if (!continuous) break;
    }
  } finally {
    clearInterval(publishInterval);
    // Final flush
    const remainingUpdates = engine.flushDirtyPairs();
    if (remainingUpdates.length > 0) {
      broadcastMarketData({
        type: 'MARKET_BATCH',
        data: remainingUpdates,
        timestamp: Date.now(),
      });
      broadcastCount++;
    }
  }

  const durationMs = Date.now() - startTime;
  const stats = engine.getStats();

  return {
    ...stats,
    broadcastCount,
    durationMs,
  };
}

module.exports = {
  parseMarketDataRow,
  MarketPairEngine,
  MarketDataStore: MarketPairEngine,
  streamCmMarketDataTicks,
  streamFoMarketDataTicks,
  streamAndBroadcastMarketData,
};

