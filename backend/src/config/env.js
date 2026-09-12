const path = require('path');
const dotenv = require('dotenv');

// Load environment variables from backend/.env
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const config = {
  db: {
    connectionString: process.env.DATABASE_URL || undefined,
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 5432,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'cash_future_db',
    ssl: process.env.NODE_ENV === 'production' || process.env.DB_SSL === 'true',
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
