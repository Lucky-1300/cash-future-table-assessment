const path = require('path');
const dotenv = require('dotenv');

// Load environment variables from backend/.env
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

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
    cmContractMasterPath: process.env.CM_CONTRACT_MASTER_PATH || path.resolve(__dirname, '../../../nse_cm_ref_contract_master.csv'),
    foContractMasterPath: process.env.FO_CONTRACT_MASTER_PATH || path.resolve(__dirname, '../../../nse_fo_ref_contract_master.csv'),
    cmMarketDataPath: process.env.CM_MARKET_DATA_PATH || path.resolve(__dirname, '../../../nsecm_market_data.csv'),
    foMarketDataPath: process.env.FO_MARKET_DATA_PATH || path.resolve(__dirname, '../../../nsefo_market_data.csv'),
  },
  port: parseInt(process.env.PORT, 10) || 5000,
};

module.exports = config;
