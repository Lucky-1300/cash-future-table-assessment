import React from 'react';

export const StatusBar = ({
  connectionStatus = 'CONNECTING',
  totalPairs = 0,
  activePairs = 0,
  ticksPerSec = 0,
  tickCount = 0,
  latency = null,
  reconnectCount = 0,
  lastUpdated,
}) => {
  const isConnected = connectionStatus === 'CONNECTED';
  const statusColor = isConnected ? 'dot-green' : connectionStatus === 'CONNECTING' ? 'dot-amber' : 'dot-red';

  return (
    <footer className="terminal-bottom-status-bar" role="contentinfo" aria-label="Terminal Status Bar">
      <div className="status-bar-left">
        <div className="status-bar-item">
          <span className={`status-dot ${statusColor}`}></span>
          <span className="status-bar-label">
            {isConnected ? 'WebSocket Connected' : connectionStatus === 'CONNECTING' ? 'Connecting to Stream...' : 'Disconnected (Attempting Reconnect)'}
          </span>
        </div>

        <div className="status-bar-divider">│</div>

        <div className="status-bar-item">
          <span className="status-bar-val">{totalPairs} Pairs</span>
          <span className="status-bar-sub">({activePairs} Active)</span>
        </div>

        <div className="status-bar-divider">│</div>

        <div className="status-bar-item">
          <span className="status-bar-val text-cyan">{ticksPerSec.toLocaleString()}</span>
          <span className="status-bar-sub">ticks/sec</span>
        </div>

        <div className="status-bar-divider">│</div>

        <div className="status-bar-item">
          <span className="status-bar-val text-mono">{tickCount.toLocaleString()}</span>
          <span className="status-bar-sub">Total Ticks</span>
        </div>
      </div>

      <div className="status-bar-right">
        {latency !== null && (
          <>
            <div className="status-bar-item">
              <span className="status-bar-sub">Latency:</span>
              <span className="status-bar-val text-mono text-green">{latency} ms</span>
            </div>
            <div className="status-bar-divider">│</div>
          </>
        )}

        {reconnectCount > 0 && (
          <>
            <div className="status-bar-item">
              <span className="status-bar-sub">Reconnects:</span>
              <span className="status-bar-val text-amber">{reconnectCount}</span>
            </div>
            <div className="status-bar-divider">│</div>
          </>
        )}

        <div className="status-bar-item">
          <span className="status-bar-sub">Last Feed Tick:</span>
          <span className="status-bar-val text-mono">{lastUpdated || 'Awaiting Data'}</span>
        </div>
      </div>
    </footer>
  );
};

export default StatusBar;
