const fs = require('fs');
const csv = require('csv-parser');
const config = require('../config/env');

// Column definitions based on inspected data files
const CM_CONTRACT_HEADERS = [
  'token',
  'assetToken',
  'instrumentType',
  'symbol',
  'expiryDate',
  'strikePrice',
  'optionType',
  'lotSize',
  'tickSize',
  'issueCapital',
  'marketType',
  'lowPriceRange',
  'highPriceRange',
  'contractName',
];

const FO_CONTRACT_HEADERS = [
  'token',
  'assetToken',
  'instrumentType',
  'symbol',
  'expiryDate',
  'strikePrice',
  'optionType',
  'lotSize',
  'tickSize',
  'issueCapital',
  'marketType',
  'lowPriceRange',
  'highPriceRange',
  'contractName',
];

const MARKET_DATA_HEADERS = [
  'token',
  'timestamp',
  'bidPrice',
  'askPrice',
  'ltp',
];

/**
 * Generic helper function to stream any CSV file row-by-row with native async backpressure.
 * Uses for-await iteration on the parser stream so that async callbacks are strictly awaited
 * one-at-a-time before reading the next chunk.
 * 
 * @param {string} filePath - Absolute or relative path to CSV file
 * @param {object} csvOptions - Configuration passed to csv-parser (separator, headers, etc.)
 * @param {function} onRow - Callback triggered for each row: onRow(row, rowIndex)
 * @param {object} options - Optional config: { limit }
 * @returns {Promise<{ totalRows: number, durationMs: number, reachedLimit: boolean }>}
 */
async function streamCsvFile(filePath, csvOptions, onRow, options = {}) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`CSV file not found at path: ${filePath}`);
  }

  const { limit = Infinity } = options;
  let rowCount = 0;
  let reachedLimit = false;
  const startTime = Date.now();

  const readStream = fs.createReadStream(filePath);
  const parser = readStream.pipe(csv(csvOptions));

  try {
    for await (const row of parser) {
      rowCount++;
      if (typeof onRow === 'function') {
        const res = await onRow(row, rowCount);
        if (res === false) {
          reachedLimit = true;
          break;
        }
      }

      if (rowCount >= limit) {
        reachedLimit = true;
        break;
      }
    }
  } finally {
    try {
      readStream.destroy();
    } catch (e) {}
    try {
      parser.destroy();
    } catch (e) {}
  }

  return {
    totalRows: rowCount,
    durationMs: Date.now() - startTime,
    reachedLimit,
  };
}

/**
 * 1. Stream CM Contract Master CSV (Space-separated, 14 fields)
 * 
 * @param {function} onRow - Callback executed for each parsed row
 * @param {object} options - Optional { filePath, limit }
 */
function streamCmContractMaster(onRow, options = {}) {
  const filePath = options.filePath || config.csv.cmContractMasterPath;
  const csvOptions = {
    separator: ' ',
    headers: CM_CONTRACT_HEADERS,
    strict: false,
    skipLines: 0,
  };
  return streamCsvFile(filePath, csvOptions, onRow, options);
}

/**
 * 2. Stream FO Contract Master CSV (Space-separated, 14 fields)
 * 
 * @param {function} onRow - Callback executed for each parsed row
 * @param {object} options - Optional { filePath, limit }
 */
function streamFoContractMaster(onRow, options = {}) {
  const filePath = options.filePath || config.csv.foContractMasterPath;
  const csvOptions = {
    separator: ' ',
    headers: FO_CONTRACT_HEADERS,
    strict: false,
    skipLines: 0,
  };
  return streamCsvFile(filePath, csvOptions, onRow, options);
}

/**
 * 3. Stream NSECM Market Data CSV (Comma-separated, 5 fields)
 * 
 * @param {function} onRow - Callback executed for each parsed row
 * @param {object} options - Optional { filePath, limit }
 */
function streamCmMarketData(onRow, options = {}) {
  const filePath = options.filePath || config.csv.cmMarketDataPath;
  const csvOptions = {
    separator: ',',
    headers: MARKET_DATA_HEADERS,
    strict: false,
    skipLines: 0,
  };
  return streamCsvFile(filePath, csvOptions, onRow, options);
}

/**
 * 4. Stream NSEFO Market Data CSV (Comma-separated, 5 fields)
 * 
 * @param {function} onRow - Callback executed for each parsed row
 * @param {object} options - Optional { filePath, limit }
 */
function streamFoMarketData(onRow, options = {}) {
  const filePath = options.filePath || config.csv.foMarketDataPath;
  const csvOptions = {
    separator: ',',
    headers: MARKET_DATA_HEADERS,
    strict: false,
    skipLines: 0,
  };
  return streamCsvFile(filePath, csvOptions, onRow, options);
}

module.exports = {
  CM_CONTRACT_HEADERS,
  FO_CONTRACT_HEADERS,
  MARKET_DATA_HEADERS,
  streamCmContractMaster,
  streamFoContractMaster,
  streamCmMarketData,
  streamFoMarketData,
  streamCsvFile,
};
