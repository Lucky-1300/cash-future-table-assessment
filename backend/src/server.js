const http = require('http');
const config = require('./config/env');
const pool = require('./db');
const {
  initWebSocketServer,
  setInitialSnapshotProvider,
  getConnectedClientCount,
  closeWebSocketServer,
} = require('./websocket/socketServer');
const { getContractsSummary } = require('./services/contractService');
const { MarketPairEngine, streamAndBroadcastMarketData } = require('./services/marketDataService');

// Global Market Engine instance
const marketEngine = new MarketPairEngine();

// Native Node HTTP Server (No Express)
const server = http.createServer(async (req, res) => {
  // Standard CORS headers for frontend integration
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  // Health and status endpoint
  if (url.pathname === '/' || url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'online',
      service: 'Cash-Future Table Assessment Backend',
      timestamp: new Date().toISOString(),
      activeWebSocketClients: getConnectedClientCount(),
      marketStats: marketEngine.getStats(),
    }));
    return;
  }

  // Paired Cash-Future contracts snapshot endpoint
  if (url.pathname === '/api/pairs') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      total: marketEngine.getAllPairs().length,
      pairs: marketEngine.getAllPairs(),
    }));
    return;
  }

  // Contract metadata summary endpoint
  if (url.pathname === '/api/contracts/summary') {
    try {
      const summary = await getContractsSummary(pool);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(summary));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Database query failed', message: err.message }));
    }
    return;
  }

  // 404 for unknown endpoints
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not Found' }));
});

/**
 * Initializes and starts the backend server cleanly.
 */
async function startServer() {
  const PORT = config.port || 5000;

  console.log('====================================================');
  console.log('       STARTING CASH-FUTURE BACKEND SERVER          ');
  console.log('====================================================');

  // 1. Initialize WebSocket Server attached to native HTTP server
  initWebSocketServer(server);
  setInitialSnapshotProvider(() => marketEngine.getAllPairs());
  console.log(`🔌 [WebSocket] Server initialized on ws://localhost:${PORT}`);

  // 2. Verify PostgreSQL Connectivity & Load Paired Contracts
  try {
    const client = await pool.connect();
    try {
      const dbRes = await client.query('SELECT current_database() AS db, NOW() AS now;');
      console.log(`🗄️  [PostgreSQL] Connected successfully to database "${dbRes.rows[0].db}" (Time: ${dbRes.rows[0].now})`);

      try {
        const countRes = await client.query('SELECT COUNT(*) AS total FROM contracts;');
        console.log(`📋 [PostgreSQL] "contracts" table verified: ${countRes.rows[0].total} records found.`);

        // Initialize Market Engine from DB
        await marketEngine.init(pool);
      } catch (tableErr) {
        console.warn(`⚠️  [PostgreSQL] Note on "contracts" table: ${tableErr.message}`);
      }
    } finally {
      client.release();
    }
  } catch (dbErr) {
    console.warn(`⚠️  [PostgreSQL] Connection status: Offline / Auth Required (${dbErr.message})`);
    if (!process.env.DB_PASSWORD) {
      console.warn('👉 [PostgreSQL] Hint: Set DB_PASSWORD in backend/.env to connect to your local PostgreSQL.');
    }
  }

  // 3. Start Native HTTP Listener
  server.listen(PORT, () => {
    console.log(`🚀 [HTTP Server] Listening on http://localhost:${PORT}`);
    console.log('====================================================');
    console.log('   Backend ready! Awaiting client connections...   ');
    console.log('====================================================\n');

    // 4. Start Market Data Streaming Feed in Background
    if (marketEngine.isInitialized) {
      setImmediate(() => {
        streamAndBroadcastMarketData(marketEngine, {
          publishIntervalMs: 1000,
          onProgress: (seg, count, stats) => {
            if (count % 250000 === 0) {
              console.log(`📡 [LiveStream] ${seg} streamed ${count.toLocaleString()} ticks (${stats.updatedPairs}/${stats.totalPairs} pairs live)`);
            }
          },
        }).then((stats) => {
          console.log(`✅ [LiveStream] Market streaming complete (${(stats.cmProcessed + stats.foProcessed).toLocaleString()} total ticks broadcasted).`);
        }).catch((err) => {
          console.warn('⚠️ [LiveStream] Streaming note:', err.message);
        });
      });
    }
  });
}

// Graceful shutdown handling
function handleShutdown(signal) {
  console.log(`\n🛑 Received ${signal}. Shutting down gracefully...`);
  marketEngine.isStreaming = false;
  closeWebSocketServer();
  server.close(() => {
    console.log('🛑 [HTTP Server] Closed.');
  });
  pool.end().then(() => {
    console.log('🛑 [PostgreSQL] Pool drained.');
    process.exit(0);
  }).catch(() => {
    process.exit(0);
  });
}

process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));

// Start server if executed directly
if (require.main === module) {
  startServer().catch((err) => {
    console.error('Fatal error starting server:', err);
    process.exit(1);
  });
}

module.exports = {
  server,
  startServer,
  marketEngine,
};
