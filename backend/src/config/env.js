const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables from backend/.env or root .env
const backendEnvPath = path.resolve(__dirname, '../../.env');
const rootEnvPath = path.resolve(__dirname, '../../../.env');

if (fs.existsSync(backendEnvPath)) {
  dotenv.config({ path: backendEnvPath });
}
if (fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath });
}
dotenv.config();

let rawDatabaseUrl = process.env.DATABASE_URL ? process.env.DATABASE_URL.trim() : undefined;
if (rawDatabaseUrl) {
  // Normalize if single slash was entered
  if (rawDatabaseUrl.startsWith('postgresql:/') && !rawDatabaseUrl.startsWith('postgresql://')) {
    rawDatabaseUrl = 'postgresql://' + rawDatabaseUrl.slice(12);
  } else if (rawDatabaseUrl.startsWith('postgres:/') && !rawDatabaseUrl.startsWith('postgres://')) {
    rawDatabaseUrl = 'postgres://' + rawDatabaseUrl.slice(10);
  }
}

// Auto-detect cloud database SSL requirement
const isCloudDb = !!(rawDatabaseUrl && (
  rawDatabaseUrl.includes('.render.com') ||
  rawDatabaseUrl.includes('amazonaws.com') ||
  rawDatabaseUrl.includes('supabase') ||
  rawDatabaseUrl.includes('neon.tech') ||
  rawDatabaseUrl.includes('sslmode=require')
));

/**
 * Resolves a CSV path across Windows, Linux, and cloud environments (e.g. Render).
 * Prioritizes environment variables, then checks standard relative directories.
 * 
 * @param {string} envVarName - Name of the environment variable (e.g. CM_MARKET_DATA_PATH)
 * @param {string} defaultFileName - Standard CSV file name
 * @returns {string} - Resolved path
 */
function resolveCsvPath(envVarName, defaultFileName) {
  const envVal = process.env[envVarName];
  if (envVal && envVal.trim()) {
    const cleanVal = envVal.trim().replace(/^["']|["']$/g, '');
    if (fs.existsSync(cleanVal)) return cleanVal;
    const normalized = path.normalize(cleanVal);
    if (fs.existsSync(normalized)) return normalized;
    const resolved = path.resolve(cleanVal);
    if (fs.existsSync(resolved)) return resolved;
    return cleanVal;
  }

  // Search standard candidate relative paths
  const candidates = [
    path.resolve(process.cwd(), 'data', defaultFileName),
    path.resolve(process.cwd(), defaultFileName),
    path.resolve(__dirname, '../../data', defaultFileName),
    path.resolve(__dirname, '../../../data', defaultFileName),
    path.resolve(__dirname, '../..', defaultFileName),
    path.resolve(__dirname, '../../..', defaultFileName),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  // Safe fallback to project root relative path
  return path.resolve(__dirname, '../../..', defaultFileName);
}

const config = {
  db: {
    connectionString: rawDatabaseUrl || undefined,
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 5432,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'cash_future_db',
    ssl: process.env.NODE_ENV === 'production' || process.env.DB_SSL === 'true' || isCloudDb,
  },
  csv: {
    cmContractMasterPath: resolveCsvPath('CM_CONTRACT_MASTER_PATH', 'nse_cm_ref_contract_master.csv'),
    foContractMasterPath: resolveCsvPath('FO_CONTRACT_MASTER_PATH', 'nse_fo_ref_contract_master.csv'),
    cmMarketDataPath: resolveCsvPath('CM_MARKET_DATA_PATH', 'nsecm_market_data.csv'),
    foMarketDataPath: resolveCsvPath('FO_MARKET_DATA_PATH', 'nsefo_market_data.csv'),
  },
  port: parseInt(process.env.PORT, 10) || 5000,
};

module.exports = config;
