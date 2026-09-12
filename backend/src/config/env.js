const path = require('path');
const dotenv = require('dotenv');

// Load environment variables from backend/.env
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const config = {
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 5432,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'cash_future_db',
  },
  csv: {
    cmContractMasterPath: process.env.CM_CONTRACT_MASTER_PATH || 'C:/Users/lucky/Downloads/task/task/nse_cm_ref_contract_master.csv',
    foContractMasterPath: process.env.FO_CONTRACT_MASTER_PATH || 'C:/Users/lucky/Downloads/task/task/nse_fo_ref_contract_master.csv',
    cmMarketDataPath: process.env.CM_MARKET_DATA_PATH || 'C:/Users/lucky/Downloads/task/task/nsecm_market_data.csv',
    foMarketDataPath: process.env.FO_MARKET_DATA_PATH || 'C:/Users/lucky/Downloads/task/task/nsefo_market_data.csv',
  },
  port: parseInt(process.env.PORT, 10) || 5000,
};

module.exports = config;
