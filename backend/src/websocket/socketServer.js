const { WebSocketServer, WebSocket } = require('ws');

class MarketWebSocketServer {
  constructor() {
    this.wss = null;
    this.clients = new Set();
    this.heartbeatInterval = null;
    this.isInitialized = false;
    this.initialSnapshotProvider = null;
  }

  /**
   * Registers a provider function to send the full snapshot on client connection.
   * @param {function} providerFn
   */
  setInitialSnapshotProvider(providerFn) {
    this.initialSnapshotProvider = providerFn;
  }

  /**
   * Initializes the WebSocket server.
   * Can either bind to an existing Node.js HTTP server instance or listen on a standalone port.
   * 
   * @param {object|number} serverOrPort - http.Server instance OR port number (e.g., 5000 or 8080)
   * @param {object} options - Optional ws configuration options
   * @returns {WebSocketServer}
   */
  init(serverOrPort, options = {}) {
    if (this.isInitialized) {
      console.warn('⚠️ WebSocket server is already initialized.');
      return this.wss;
    }

    const wssOptions = {
      ...options,
    };

    if (typeof serverOrPort === 'number') {
      wssOptions.port = serverOrPort;
    } else if (serverOrPort && typeof serverOrPort === 'object') {
      wssOptions.server = serverOrPort;
    } else {
      throw new Error('initWebSocketServer requires an HTTP server instance or a port number.');
    }

    this.wss = new WebSocketServer(wssOptions);
    this.isInitialized = true;

    this.wss.on('connection', (ws, req) => {
      this._handleConnection(ws, req);
    });

    this.wss.on('error', (err) => {
      console.error('❌ WebSocket Server Error:', err.message);
    });

    // Start 30-second ping/pong heartbeat to clean up disconnected/dead sockets
    this._startHeartbeat();

    console.log(`🚀 WebSocket server initialized successfully ${wssOptions.port ? `on port ${wssOptions.port}` : 'attached to HTTP server'}.`);
    return this.wss;
  }

  /**
   * Handles newly connected WebSocket client.
   * @private
   */
  _handleConnection(ws, req) {
    const clientIp = req.socket.remoteAddress;
    ws.isAlive = true;
    this.clients.add(ws);

    console.log(`🔌 Client connected [IP: ${clientIp}]. Active clients: ${this.clients.size}`);

    // 1. Send welcome message
    this.sendToClient(ws, {
      type: 'CONNECTION_ACK',
      message: 'Connected to Cash-Future Market Data Stream',
      activeClients: this.clients.size,
      timestamp: Date.now(),
    });

    // 2. Send initial snapshot if provider is registered
    if (typeof this.initialSnapshotProvider === 'function') {
      try {
        const snapshot = this.initialSnapshotProvider();
        if (snapshot && snapshot.length > 0) {
          this.sendToClient(ws, {
            type: 'INITIAL_SNAPSHOT',
            data: snapshot,
            timestamp: Date.now(),
          });
        }
      } catch (err) {
        console.error('Error sending initial snapshot to client:', err.message);
      }
    }

    // Pong handler for heartbeat
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    // Client message handler
    ws.on('message', (message) => {
      try {
        const parsed = JSON.parse(message.toString());
        if (parsed.type === 'PING') {
          this.sendToClient(ws, {
            type: 'PONG',
            timestamp: Date.now(),
            clientTimestamp: parsed.clientTimestamp || parsed.timestamp,
          });
        } else if (parsed.type === 'GET_SNAPSHOT' && typeof this.initialSnapshotProvider === 'function') {
          const snapshot = this.initialSnapshotProvider();
          this.sendToClient(ws, {
            type: 'INITIAL_SNAPSHOT',
            data: snapshot,
            timestamp: Date.now(),
          });
        }
      } catch (e) {
        // Non-JSON or unrecognized message ignored safely
      }
    });

    // Client error handler
    ws.on('error', (err) => {
      console.error('⚠️ Client WebSocket error:', err.message);
    });

    // Client disconnect handler
    ws.on('close', (code, reason) => {
      this.clients.delete(ws);
      console.log(`🔌 Client disconnected (code: ${code}). Remaining active clients: ${this.clients.size}`);
    });
  }

  /**
   * Sends a JSON message to a single specific client.
   * 
   * @param {WebSocket} ws - Target client socket
   * @param {object} data - Payload object to serialize
   */
  sendToClient(ws, data) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(data));
      } catch (err) {
        console.error('Error sending message to client:', err.message);
      }
    }
  }

  /**
   * Broadcasts a JSON payload to all connected and open clients.
   * 
   * @param {object} data - Object or message payload to broadcast
   * @returns {number} - Number of clients successfully messaged
   */
  broadcast(data) {
    if (this.clients.size === 0) return 0;

    const messageString = typeof data === 'string' ? data : JSON.stringify(data);
    let sentCount = 0;

    for (const ws of this.clients) {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(messageString);
          sentCount++;
        } catch (err) {
          console.error('Error broadcasting to client:', err.message);
        }
      }
    }

    return sentCount;
  }

  /**
   * Returns current count of connected clients.
   * @returns {number}
   */
  getConnectedClientCount() {
    return this.clients.size;
  }

  /**
   * Periodically pings clients to prune dead connections without blocking the event loop.
   * @private
   */
  _startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      for (const ws of this.clients) {
        if (!ws.isAlive) {
          console.log('⚠️ Terminating unresponsive client socket (missed heartbeat).');
          this.clients.delete(ws);
          ws.terminate();
          continue;
        }
        ws.isAlive = false;
        ws.ping();
      }
    }, 30000);
  }

  /**
   * Gracefully shuts down the WebSocket server and disconnects clients.
   */
  close() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    for (const ws of this.clients) {
      try {
        ws.close(1000, 'Server shutting down');
      } catch (e) {}
    }
    this.clients.clear();

    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }
    this.isInitialized = false;
    console.log('🛑 WebSocket server stopped.');
  }
}

// Singleton instance
const marketWsServer = new MarketWebSocketServer();

module.exports = {
  MarketWebSocketServer,
  marketWsServer,
  initWebSocketServer: (serverOrPort, options) => marketWsServer.init(serverOrPort, options),
  broadcastMarketData: (data) => marketWsServer.broadcast(data),
  setInitialSnapshotProvider: (fn) => marketWsServer.setInitialSnapshotProvider(fn),
  getConnectedClientCount: () => marketWsServer.getConnectedClientCount(),
  closeWebSocketServer: () => marketWsServer.close(),
};
