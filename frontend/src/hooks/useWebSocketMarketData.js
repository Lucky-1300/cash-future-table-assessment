import { useState, useEffect, useRef, useCallback } from 'react';

const DEFAULT_WS_URL = 'ws://localhost:5000';
const RECONNECT_DELAY_MS = 3000;
const FLUSH_INTERVAL_MS = 100; // Batch updates to 10fps for smooth 60fps UI rendering
const PING_INTERVAL_MS = 3000; // Ping server every 3s for precise latency tracking

/**
 * Custom React Hook for live market data streaming via native browser WebSocket API.
 * 
 * Features:
 * - Native WebSocket client (no Socket.IO, no external WS libraries)
 * - Automatic initial snapshot loading (INITIAL_SNAPSHOT)
 * - Batch tick updates handling (MARKET_BATCH)
 * - O(1) in-memory symbol & token indexing to prevent duplicates
 * - Throttled 100ms React state sync for optimal AG Grid performance
 * - Real-time Ticks/sec and Active Pairs calculation
 * - Dynamic Ping/Pong Round-Trip Latency measurement
 * - Resilient auto-reconnect tracking
 * - Clean unmount and connection lifecycle teardown
 * 
 * @param {string} url - WebSocket server URL (defaults to ws://localhost:5000)
 * @returns {{
 *   marketData: Array<object>,
 *   connectionStatus: 'CONNECTING'|'CONNECTED'|'DISCONNECTED'|'ERROR',
 *   errorStatus: string|null,
 *   error: string|null,
 *   tickCount: number,
 *   ticksPerSec: number,
 *   activePairsCount: number,
 *   latency: number|null,
 *   reconnectCount: number,
 *   lastUpdated: string|null,
 *   reconnect: function
 * }}
 */
export function useWebSocketMarketData(url = DEFAULT_WS_URL) {
  const [connectionStatus, setConnectionStatus] = useState('CONNECTING');
  const [errorStatus, setErrorStatus] = useState(null);
  const [marketData, setMarketData] = useState([]);
  const [tickCount, setTickCount] = useState(0);
  const [ticksPerSec, setTicksPerSec] = useState(0);
  const [activePairsCount, setActivePairsCount] = useState(0);
  const [latency, setLatency] = useState(null);
  const [reconnectCount, setReconnectCount] = useState(0);
  const [lastUpdated, setLastUpdated] = useState(null);

  // References for mutable state without triggering unnecessary component re-renders
  const wsRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const flushTimerRef = useRef(null);
  const rateTimerRef = useRef(null);
  const pingTimerRef = useRef(null);
  const isUnmountedRef = useRef(false);
  const hasPendingUpdatesRef = useRef(false);

  const tickCountRef = useRef(0);
  const lastSecTickCountRef = useRef(0);

  // In-memory indexing maps for O(1) high-speed record lookup
  const rowMapRef = useRef(new Map()); // Symbol -> Pair Row
  const tokenToSymbolMapRef = useRef(new Map()); // Token -> Symbol

  // Populates lookup maps from a snapshot of pairs
  const applySnapshot = useCallback((snapshotList) => {
    if (!Array.isArray(snapshotList)) return;

    rowMapRef.current.clear();
    tokenToSymbolMapRef.current.clear();

    const initialRows = [];
    let activeCount = 0;

    for (const item of snapshotList) {
      if (!item || !item.symbol) continue;

      const symbol = item.symbol.trim();
      const cashToken = item.cashToken ? item.cashToken.toString().trim() : '';
      const futureToken = item.futureToken ? item.futureToken.toString().trim() : '';

      const cashLtp = Number.isFinite(item.cashLtp) && item.cashLtp > 0 ? Number(item.cashLtp) : null;
      const cashBid = Number.isFinite(item.cashBid) ? Number(item.cashBid) : null;
      const cashAsk = Number.isFinite(item.cashAsk) ? Number(item.cashAsk) : null;

      const futureLtp = Number.isFinite(item.futureLtp) && item.futureLtp > 0 ? Number(item.futureLtp) : null;
      const futureBid = Number.isFinite(item.futureBid) ? Number(item.futureBid) : null;
      const futureAsk = Number.isFinite(item.futureAsk) ? Number(item.futureAsk) : null;

      if (cashLtp !== null || futureLtp !== null) {
        activeCount++;
      }

      let spread = item.spread !== undefined ? item.spread : null;
      let spreadPercent = item.spreadPercent !== undefined ? item.spreadPercent : null;

      if (futureLtp !== null && cashLtp !== null) {
        spread = Number((futureLtp - cashLtp).toFixed(2));
        spreadPercent = cashLtp > 0 ? Number(((spread / cashLtp) * 100).toFixed(2)) : 0;
      }

      const row = {
        symbol,
        cashToken,
        cashContractName: item.cashContractName || symbol,
        cashLtp,
        cashBid,
        cashAsk,
        futureToken,
        futureContractName: item.futureContractName || `${symbol} FUT`,
        futureExpiry: item.futureExpiry || null,
        futureLtp,
        futureBid,
        futureAsk,
        spread,
        spreadPercent,
        lastUpdated: item.lastUpdated || new Date().toLocaleTimeString(),
      };

      rowMapRef.current.set(symbol, row);
      if (cashToken) tokenToSymbolMapRef.current.set(cashToken, symbol);
      if (futureToken) tokenToSymbolMapRef.current.set(futureToken, symbol);
      initialRows.push({ ...row });
    }

    setMarketData(initialRows);
    setActivePairsCount(activeCount);
    setLastUpdated(new Date().toLocaleTimeString());
    console.log(`📊 [useWebSocket] Loaded INITIAL_SNAPSHOT with ${initialRows.length} Cash-Future pairs.`);
  }, []);

  // Applies a single tick update to the existing row in memory
  const applySingleTick = useCallback((tick) => {
    if (!tick || !tick.token) return;

    const tokenStr = tick.token.toString().trim();
    const symbol = tokenToSymbolMapRef.current.get(tokenStr);
    if (!symbol) return;

    const row = rowMapRef.current.get(symbol);
    if (!row) return;

    const isCash = tick.exchange === 'NSECM' || tokenStr === row.cashToken;
    const isFuture = tick.exchange === 'NSEFO' || tokenStr === row.futureToken;

    if (isCash) {
      if (Number.isFinite(tick.ltp) && tick.ltp > 0) row.cashLtp = tick.ltp;
      if (Number.isFinite(tick.bid)) row.cashBid = tick.bid;
      if (Number.isFinite(tick.ask)) row.cashAsk = tick.ask;
    } else if (isFuture) {
      if (Number.isFinite(tick.ltp) && tick.ltp > 0) row.futureLtp = tick.ltp;
      if (Number.isFinite(tick.bid)) row.futureBid = tick.bid;
      if (Number.isFinite(tick.ask)) row.futureAsk = tick.ask;
    }

    // Recalculate Basis Spread (Future LTP - Cash LTP)
    if (row.futureLtp !== null && row.cashLtp !== null) {
      row.spread = Number((row.futureLtp - row.cashLtp).toFixed(2));
      row.spreadPercent = row.cashLtp > 0 ? Number(((row.spread / row.cashLtp) * 100).toFixed(2)) : 0;
    }

    row.lastUpdated = new Date().toLocaleTimeString();
    hasPendingUpdatesRef.current = true;
  }, []);

  // Main native WebSocket connection handler
  const connect = useCallback(() => {
    if (isUnmountedRef.current) return;

    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch (e) {}
    }

    setConnectionStatus('CONNECTING');
    setErrorStatus(null);

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (isUnmountedRef.current) return;
        setConnectionStatus('CONNECTED');
        setErrorStatus(null);
        console.log(`🔌 [WebSocket] Connected to ${url}`);

        // Immediate ping on connect
        try {
          ws.send(JSON.stringify({ type: 'PING', clientTimestamp: Date.now() }));
        } catch (e) {}
      };

      ws.onmessage = (event) => {
        if (isUnmountedRef.current) return;

        let message;
        try {
          message = JSON.parse(event.data);
        } catch (parseErr) {
          console.warn('⚠️ [WebSocket] Malformed JSON message ignored:', event.data);
          return;
        }

        setLastUpdated(new Date().toLocaleTimeString());

        // 1. Connection ACK
        if (message.type === 'CONNECTION_ACK') {
          console.log('✅ [WebSocket] Connection acknowledged by backend.');
        }
        // 2. Pong Latency Measurement
        else if (message.type === 'PONG') {
          const sent = message.clientTimestamp || message.timestamp;
          if (sent) {
            const rtt = Math.max(1, Date.now() - sent);
            setLatency(rtt);
          }
        }
        // 3. Initial Snapshot (All pairs)
        else if (message.type === 'INITIAL_SNAPSHOT' && Array.isArray(message.data)) {
          applySnapshot(message.data);
        }
        // 4. Batch Market Ticks
        else if (message.type === 'MARKET_BATCH' && Array.isArray(message.data)) {
          tickCountRef.current += message.data.length;
          setTickCount(tickCountRef.current);
          for (let i = 0; i < message.data.length; i++) {
            applySingleTick(message.data[i]);
          }
        }
        // 5. Single Market Tick
        else if (message.type === 'MARKET_TICK' && message.data) {
          tickCountRef.current += 1;
          setTickCount(tickCountRef.current);
          applySingleTick(message.data);
        }
      };

      ws.onerror = (err) => {
        if (isUnmountedRef.current) return;
        console.error('❌ [WebSocket] Connection error:', err);
        setConnectionStatus('ERROR');
        setErrorStatus('WebSocket error connecting to server');
      };

      ws.onclose = (event) => {
        if (isUnmountedRef.current) return;
        setConnectionStatus('DISCONNECTED');
        setLatency(null);
        setTicksPerSec(0);
        setErrorStatus(`Disconnected (code: ${event.code})`);
        console.log(`🔌 [WebSocket] Connection closed (code: ${event.code}). Auto-reconnecting in ${RECONNECT_DELAY_MS}ms...`);

        if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = setTimeout(() => {
          setReconnectCount((c) => c + 1);
          connect();
        }, RECONNECT_DELAY_MS);
      };
    } catch (err) {
      if (isUnmountedRef.current) return;
      setConnectionStatus('ERROR');
      setLatency(null);
      setErrorStatus(err.message);
      console.error('❌ [WebSocket] Failed to instantiate WebSocket:', err.message);

      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = setTimeout(() => {
        setReconnectCount((c) => c + 1);
        connect();
      }, RECONNECT_DELAY_MS);
    }
  }, [url, applySnapshot, applySingleTick]);

  // Lifecycle management: connection + throttled React state sync + rate tracking
  useEffect(() => {
    isUnmountedRef.current = false;
    connect();

    // 100ms interval flushes buffered in-memory updates to React state
    flushTimerRef.current = setInterval(() => {
      if (hasPendingUpdatesRef.current && !isUnmountedRef.current && rowMapRef.current.size > 0) {
        hasPendingUpdatesRef.current = false;
        const rows = Array.from(rowMapRef.current.values());
        setMarketData(rows.map((r) => ({ ...r })));

        let active = 0;
        for (let i = 0; i < rows.length; i++) {
          if (rows[i].cashLtp !== null || rows[i].futureLtp !== null) {
            active++;
          }
        }
        setActivePairsCount(active);
      }
    }, FLUSH_INTERVAL_MS);

    // 1000ms rolling rate calculator (ticks/sec)
    rateTimerRef.current = setInterval(() => {
      if (isUnmountedRef.current) return;
      const current = tickCountRef.current;
      const delta = current - lastSecTickCountRef.current;
      lastSecTickCountRef.current = current;
      setTicksPerSec(delta > 0 ? delta : 0);
    }, 1000);

    // 3000ms ping interval for live latency
    pingTimerRef.current = setInterval(() => {
      if (isUnmountedRef.current) return;
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        try {
          wsRef.current.send(JSON.stringify({ type: 'PING', clientTimestamp: Date.now() }));
        } catch (e) {}
      }
    }, PING_INTERVAL_MS);

    return () => {
      isUnmountedRef.current = true;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (flushTimerRef.current) clearInterval(flushTimerRef.current);
      if (rateTimerRef.current) clearInterval(rateTimerRef.current);
      if (pingTimerRef.current) clearInterval(pingTimerRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null; // Prevent reconnection trigger on intentional unmount
        wsRef.current.close(1000, 'Component unmounted');
        wsRef.current = null;
      }
    };
  }, [connect]);

  return {
    marketData,
    connectionStatus,
    errorStatus,
    error: errorStatus,
    tickCount,
    ticksPerSec,
    activePairsCount,
    latency,
    reconnectCount,
    lastUpdated,
    reconnect: connect,
  };
}

export default useWebSocketMarketData;
