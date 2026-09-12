# Real-Time Cash–Future Market Table Assessment

A high-performance real-time market monitoring application built with **React**, **AG Grid Community**, **Node.js**, **PostgreSQL**, and **Native WebSockets**. The application processes NSE Cash Market (`NSECM`) and Futures (`NSEFO`) contract files and tick data, pairs each eligible equity stock with its nearest-expiry future contract, calculates live **Buy Spread** and **Sell Spread** in real time, and streams updates to an interactive AG Grid table.

---

## 1. Project Objective

The primary objective of this project is to build a full-stack real-time Cash–Future table that:
- Ingests and filters contract master files for NSECM and NSEFO.
- Stores contract information in PostgreSQL.
- Pairs stocks that have **both** an NSECM equity contract and an NSEFO `FUTSTK` contract.
- Selects the single `FUTSTK` contract with the **minimum/nearest expiry date** for each stock.
- Processes live market data streams and associates ticks using the contract `token`.
- Calculates **Buy Spread** and **Sell Spread** dynamically as market data arrives.
- Streams market updates from a Node.js WebSocket server to a React frontend using native WebSockets.
- Renders exactly **one row per stock** in AG Grid with live price updates and spread recalculations.

---

## 2. Input Files

The application processes four CSV data feeds:

| File Name | Description | Key Fields Used |
| :--- | :--- | :--- |
| `nse_cm_ref_contract_master.csv` | NSECM Reference Contract Master | `token`, `instrumentType` (`EQUITY`), `symbol`, `expiryDate`, `contractName` |
| `nse_fo_ref_contract_master.csv` | NSEFO Reference Contract Master | `token`, `instrumentType` (`FUTSTK` only), `symbol`, `expiryDate`, `contractName` |
| `nsecm_market_data.csv` | NSECM Market Tick Data | `token`, `timestamp`, `bid` / `bidPrice`, `ask` / `askPrice`, `ltp` |
| `nsefo_market_data.csv` | NSEFO Market Tick Data | `token`, `timestamp`, `bid` / `bidPrice`, `ask` / `askPrice`, `ltp` |

*Note: For the FO contract file, only rows where `instrumentType = 'FUTSTK'` are ingested; all index and option contracts (`OPTSTK`, `OPTIDX`, `FUTIDX`) are ignored.*

---

## 3. PostgreSQL Contract Storage

The backend reads the contract master files using Node.js streaming and persists contract metadata in PostgreSQL. This allows the system to efficiently index and identify:
- NSECM Cash (`EQUITY`) contracts
- NSEFO Futures (`FUTSTK`) contracts
- Token numbers (Primary Key)
- Stock symbols
- Expiry dates
- Contract names

### Database Schema
```sql
CREATE TABLE IF NOT EXISTS contracts (
    token BIGINT PRIMARY KEY,
    instrument_type VARCHAR(20) NOT NULL,
    symbol VARCHAR(50) NOT NULL,
    expiry_date BIGINT,
    contract_name VARCHAR(100) NOT NULL,
    exchange VARCHAR(10) NOT NULL
);
```

---

## 4. Nearest Future Selection & Stock Pairing

A single stock in the derivatives market may have multiple futures contracts with different expiry months (e.g., Near-Month, Next-Month, Far-Month).

To satisfy the assessment requirements:
1. **FUTSTK Only**: Only stock futures (`FUTSTK`) are eligible for pairing.
2. **Nearest Expiry Selection**: For every stock, the query selects the `FUTSTK` contract having the **minimum/nearest `expiryDate`**.
3. **Mutual Existence**: Only stocks possessing **both** an NSECM equity contract and an NSEFO `FUTSTK` contract are included.
4. **Exactly One Row Per Stock**: The resulting dataset contains exactly one paired row per eligible stock.

### PostgreSQL Pairing Query
```sql
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
```

---

## 5. Market Data Token Matching

Market data files contain tick-level pricing information:
- `token`: Unique numeric identifier matching the contract master.
- `timestamp`: Epoch timestamp of the tick.
- `bid` / `bidPrice`: Best bid price (raw value in paise, divided by 100 to get INR).
- `ask` / `askPrice`: Best ask price (raw value in paise, divided by 100 to get INR).
- `ltp`: Last Traded Price (raw value in paise, divided by 100 to get INR).

The backend uses the **`token`** to associate incoming ticks with the appropriate Cash or Future contract. For each paired stock, the system maintains the latest state in memory:

- **Cash Market (NSECM)**: Latest Bid, Latest Ask, Latest LTP
- **Futures Market (NSEFO)**: Latest Bid, Latest Ask, Latest LTP

---

## 6. Exact Spread Formulas

The core assessment calculations are **Buy Spread** and **Sell Spread**, defined as:

$$\mathbf{Buy\ Spread} = \mathbf{Future\ Bid} - \mathbf{Stock\ Ask}$$

$$\mathbf{Sell\ Spread} = \mathbf{Stock\ Bid} - \mathbf{Future\ Ask}$$

These formulas are calculated and updated automatically whenever new market data arrives for either the Cash or Future leg of a stock.

---

## 7. Required Frontend Table

The AG Grid table displays **exactly one row per eligible stock** and prominently includes the five mandatory assessment columns:

| Mandatory Column | Field | Description |
| :--- | :--- | :--- |
| **Symbol** | `symbol` | Stock ticker symbol |
| **Stock LTP** | `cashLtp` | Latest NSECM Cash Last Traded Price |
| **Future LTP** | `futureLtp` | Latest Last Traded Price of the selected nearest-expiry `FUTSTK` |
| **Buy Spread** | `buySpread` | Calculated as `Future Bid - Stock Ask` |
| **Sell Spread** | `sellSpread` | Calculated as `Stock Bid - Future Ask` |

*The table contains exactly one row per eligible stock.*

---

## 8. WebSocket Streaming & Architecture

### Complete Data Flow
```
CSV Market Data Files (nsecm_market_data.csv & nsefo_market_data.csv)
       │
       ▼ (Node.js Streams + csv-parser)
Backend Market Engine (Matches tokens, maintains latest prices, computes spreads)
       │
       ▼ (1-Second Interval Broadcast)
Native Node.js WebSocket Server (ws://localhost:5000)
       │
       ▼ (Native Browser WebSocket Client)
React useWebSocketMarketData Hook (In-memory lookup, 100ms render throttle)
       │
       ▼ (Real-time delta update via getRowId)
AG Grid Table (Updates existing rows in-place with zero duplicate rows)
```

### Key WebSocket Properties
- **Native WebSocket**: Backend uses the native `ws` library; frontend uses the native browser `WebSocket` API.
- **No Socket.IO**: Socket.IO is not used anywhere in the stack.
- **No Express**: The backend HTTP server is created purely using Node's native `http` module.
- **1-Second Publishing Interval**: The backend continuously ingests CSV market ticks, updates its in-memory state, and broadcasts market updates to connected clients at **1-second intervals** (`1000ms`), fulfilling the assessment requirement.
- **Frontend 100ms Batching**: The frontend hook uses a 100ms throttle to buffer state updates before syncing to React state. This is strictly a UI rendering optimization (aimed at smooth 60fps rendering) and does not alter the backend's 1-second WebSocket publishing interval.

---

## 9. Real-Time AG Grid Updates

- **In-Place Row Updates**: Incoming WebSocket data updates existing rows via `getRowId: (params) => params.data.symbol`.
- **Zero Duplicate Rows**: Each symbol maps to a single row in the AG Grid.
- **Automatic Recalculation**: `Stock LTP`, `Future LTP`, `Buy Spread`, and `Sell Spread` update automatically with cell change flashing.

---

## 10. Technology Stack

### Frontend
- **Framework**: React (v19) + Vite
- **Table Engine**: AG Grid Community (v36)
- **WebSocket Client**: Native Browser `WebSocket` API
- **Styling**: Vanilla CSS (Quartz theme custom design system)

### Backend
- **Runtime**: Node.js
- **HTTP Server**: Native `http.createServer` (No Express)
- **WebSocket Server**: `ws` (Native WebSockets, No Socket.IO)
- **CSV Parser**: `csv-parser` with chunked streaming
- **Database Driver**: `pg` (PostgreSQL client pool)

### Database
- **Engine**: PostgreSQL

---

## 11. Implemented Extra Features

In addition to the mandatory assessment requirements, the following UI and analytical enhancements are available:
- **Top Arbitrage Opportunities**: Dynamic live leaderboard highlighting contracts with the largest positive spread.
- **Watchlist**: Star and filter favorite stocks with persistence.
- **Market Detail Drawer**: Slide-in panel displaying detailed Cash/Future contract specs, tokens, bid/ask depth, and spread analytics.
- **Market Statistics**: Aggregate counts of active pairs, updated pairs, and token metrics.
- **Live Metrics**: Real-time Ticks/sec rate and WebSocket Ping/Pong Round-Trip Time (RTT) latency indicator.
- **Data-Grid Pagination Bar**: Custom pagination footer with page-size selection (`10`, `20`, `50`, `100`, `250`).
- **Theme Toggle**: Seamless dark mode and light mode switching.
- **CSV Export**: Client-side AG Grid data export.
- **Basis Spread & Spread %**: Additional reference columns (`Future LTP - Stock LTP`).

---

## 12. Database Verification & Statistics

The PostgreSQL database state matches the source data:
- **Total Contracts in Database**: 5,080 records
- **NSECM Equity Contracts**: 4,433 records
- **NSEFO FUTSTK Contracts**: 647 records
- **Paired Cash–Future Stocks (Nearest Expiry)**: **228 unique stocks**

---

## 13. Security & Constraints

- **No Hardcoded Passwords**: Database credentials and connection settings are loaded exclusively from `process.env`.
- **Git Ignored Files**: `.env` and large raw data files (`*.csv`) are included in `.gitignore`.
- **Memory-Safe Streaming**: CSV files are read sequentially using Node.js readable streams (`csv-parser`) to prevent memory exhaustion.
- **No Prohibited Libraries**: Verified zero instances of `express` or `socket.io`.

---

## 14. Setup & Running Instructions

### 1. Prerequisites
- **Node.js**: v18 or later
- **PostgreSQL**: v13 or later running locally

### 2. Database Initialization
Create the database in PostgreSQL:
```sql
CREATE DATABASE cash_future_db;
```

### 3. Backend Configuration
Navigate to the `backend` directory:
```bash
cd backend
npm install
```

Create or edit `backend/.env` with your PostgreSQL credentials and the local paths to the CSV files:
```env
PORT=5000
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your_postgres_password
DB_NAME=cash_future_db

# Configure paths to your local CSV files
CM_CONTRACT_MASTER_PATH=C:/path/to/nse_cm_ref_contract_master.csv
FO_CONTRACT_MASTER_PATH=C:/path/to/nse_fo_ref_contract_master.csv
CM_MARKET_DATA_PATH=C:/path/to/nsecm_market_data.csv
FO_MARKET_DATA_PATH=C:/path/to/nsefo_market_data.csv
```

### 4. Contract Import (One-Time Setup)
Import the CM Equity and FO FUTSTK contracts into PostgreSQL:
```bash
npm run import:contracts
```

### 5. Start Backend Server
```bash
npm start
```
*The backend will listen on `http://localhost:5000` and `ws://localhost:5000`.*

### 6. Start Frontend Application
In a separate terminal:
```bash
cd frontend
npm install
npm run dev
```
Open `http://localhost:5173` in your browser.

---

## 15. Testing & Verification Suites

The repository contains automated test scripts to verify each component independently:

| Test Script | Command | Purpose |
| :--- | :--- | :--- |
| **Database Connection** | `node backend/src/testDb.js` | Verifies PostgreSQL connectivity and pool configuration |
| **CSV Streaming** | `node backend/src/testCsv.js` | Verifies memory-safe stream parsing of CSV files |
| **Contract Processing** | `node backend/src/testContracts.js` | Verifies CM Equity and FO FUTSTK contract filtering |
| **Nearest Expiry Verification** | `node backend/src/testNearestExpiry.js` | Confirms minimum expiry selection and 1-row-per-stock pairing |
| **Market Data Ingestion** | `node backend/src/testMarketData.js` | Verifies paise-to-rupee parsing and token caching |
| **WebSocket Broadcast** | `node backend/src/testWs.js` | Tests native WebSocket handshake and message broadcasting |
| **Full Integration Suite** | `node backend/src/testIntegration.js` | End-to-end integration test across all layers |
| **Table Integration** | `node backend/src/testTableIntegration.js` | Validates live WebSocket tick delivery and zero duplicate rows |
| **Real Market Data Stream** | `node backend/src/testRealMarketData.js` | Verifies real CSV streaming and WebSocket packet delivery |
| **Frontend Compliance Audit** | `node backend/src/testFrontendCompliance.js` | Verifies required AG Grid columns and spread calculations |
| **Final Compliance Audit Suite** | `node backend/src/testComplianceAudit.js` | Automated audit of all 10 mandatory assessment requirements |
| **Frontend Production Build** | `cd frontend && npm run build` | Compiles and validates React production bundle with Vite |

---

## 16. Assessment Compliance Summary

- **Contract Processing**: Only CM Equities and FO `FUTSTK` contracts ingested and stored in PostgreSQL.
- **Nearest Expiry**: For each stock, the `FUTSTK` contract with the minimum `expiryDate` is paired.
- **Single Row Per Stock**: AG Grid displays exactly one row per stock (228 stocks total).
- **Mandatory Columns**: `Symbol`, `Stock LTP`, `Future LTP`, `Buy Spread`, and `Sell Spread` are present and live.
- **Spread Formulas**: `Buy Spread = Future Bid - Stock Ask` and `Sell Spread = Stock Bid - Future Ask`.
- **WebSocket Feed**: Native Node.js WebSocket broadcasts market updates at 1-second intervals.
- **Architecture**: Native Node.js HTTP + `ws` + PostgreSQL + React + AG Grid (Zero Express, Zero Socket.IO).
