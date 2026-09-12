# Cash Future Market Arbitrage Terminal

A high-performance real-time assessment application that streams NSE Cash Market (`NSECM`) and Futures & Options (`NSEFO`) contract master and tick data, maps Cash vs Future pairs, computes Basis Spread in real time, and renders an interactive financial table using **React + AG Grid Community v36** and **Native Node.js + WebSockets + PostgreSQL**.

---

## 🏗️ Architecture & Data Pipeline

```
┌─────────────────────────────────────────────────────────┐
│                    NSE CSV DATA FEEDS                   │
│  • nse_cm_ref_contract_master.csv (Equities)           │
│  • nse_fo_ref_contract_master.csv (Futures)            │
│  • nsecm_market_data.csv (Cash Ticks)                   │
│  • nsefo_market_data.csv (Futures Ticks)                │
└────────────────────────────┬────────────────────────────┘
                             │ (Node.js Streams + csv-parser)
                             ▼
┌─────────────────────────────────────────────────────────┐
│                     BACKEND SERVICES                    │
│  • csvService.js: Chunked streaming & backpressure      │
│  • contractService.js: SQL batching into PostgreSQL     │
│  • marketDataService.js: Number conversion & caching    │
│  • socketServer.js: Native ws WebSocket broadcast       │
│  • server.js: Native HTTP + Healthcheck (No Express)    │
└────────────────────────────┬────────────────────────────┘
                             │ (TCP / WebSocket ws://localhost:5000)
                             ▼
┌─────────────────────────────────────────────────────────┐
│                    REACT FRONTEND (Vite)                │
│  • useWebSocketMarketData.js: 100ms batched state flush │
│  • MarketDataTable.jsx: AG Grid v36 Quartz Dark Theme   │
│  • Delta Updates via getRowId(symbol)                   │
└─────────────────────────────────────────────────────────┘
```

---

## 🚀 Getting Started

### 1. Prerequisites
- **Node.js**: v18+ (Tested on v24)
- **PostgreSQL**: Running on port `5432` with database `cash_future_db`

---

### 2. Backend Setup & Startup

1. Open `backend/.env` and specify your PostgreSQL password and CSV paths:
   ```env
   DB_HOST=localhost
   DB_PORT=5432
   DB_USER=postgres
   DB_PASSWORD=your_actual_password
   DB_NAME=cash_future_db

   CM_CONTRACT_MASTER_PATH=C:/path/to/nse_cm_ref_contract_master.csv
   FO_CONTRACT_MASTER_PATH=C:/path/to/nse_fo_ref_contract_master.csv
   CM_MARKET_DATA_PATH=C:/path/to/nsecm_market_data.csv
   FO_MARKET_DATA_PATH=C:/path/to/nsefo_market_data.csv
   ```

2. *(Optional)* Import Contract Master CSVs into PostgreSQL:
   ```bash
   cd backend
   npm run import:contracts
   ```

3. Start the Backend Server:
   ```bash
   cd backend
   npm start
   ```
   *The backend starts at `http://localhost:5000` (HTTP) and `ws://localhost:5000` (WebSocket).*

---

### 3. Frontend Setup & Startup

1. Open a new terminal:
   ```bash
   cd frontend
   npm run dev
   ```
2. Open `http://localhost:5173` in your browser.

---

## 🗄️ PostgreSQL Setup & Schema

Ensure the database and table are created in PostgreSQL:

```sql
CREATE DATABASE cash_future_db;

\c cash_future_db

CREATE TABLE IF NOT EXISTS contracts (
    token BIGINT PRIMARY KEY,
    instrument_type VARCHAR(20) NOT NULL,
    symbol VARCHAR(50) NOT NULL,
    expiry_date BIGINT,
    contract_name VARCHAR(100) NOT NULL,
    exchange VARCHAR(10) NOT NULL
);
```

### Verification Query:
```sql
SELECT exchange, instrument_type, COUNT(*) 
FROM contracts 
GROUP BY exchange, instrument_type;
```

---

## 🧪 Verification & Test Scripts

You can independently verify every layer using the built-in test scripts:

- **Database Connection**: `node backend/src/testDb.js`
- **CSV Streaming**: `node backend/src/testCsv.js`
- **Contract Processing**: `node backend/src/testContracts.js`
- **Market Data Ticks**: `node backend/src/testMarketData.js`
- **WebSocket Server**: `node backend/src/testWs.js`
- **Full End-to-End Suite**: `node backend/src/testIntegration.js`

---

## 🛡️ Constraint & Security Checklist
- [x] **No hardcoded passwords** (All loaded from `process.env.DB_PASSWORD`)
- [x] **Git Security**: `.env` and `*.csv` are strictly gitignored
- [x] **No Express**: Native Node.js `http` module used throughout
- [x] **No Socket.IO**: Pure native `ws` and browser `WebSocket` used
- [x] **Memory Safety**: No `readFileSync` or bulk CSV in-memory loads
