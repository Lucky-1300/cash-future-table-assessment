import React from 'react';

export const Header = ({
  totalPairs = 0,
  averageSpread = 0,
  connectionStatus = 'CONNECTING',
  tickCount = 0,
  latency = null,
  reconnectCount = 0,
  lastUpdated,
  theme = 'dark',
  onToggleTheme,
  onReconnect,
  onOpenStats,
}) => {
  const getStatusConfig = () => {
    switch (connectionStatus) {
      case 'CONNECTED':
        return {
          label: 'STREAM LIVE',
          subText: 'Connected',
          className: 'status-connected',
          dotClass: 'dot-green',
        };
      case 'CONNECTING':
        return {
          label: 'CONNECTING',
          subText: 'Attempting to connect...',
          className: 'status-connecting',
          dotClass: 'dot-amber',
        };
      case 'DISCONNECTED':
        return {
          label: 'DISCONNECTED',
          subText: 'Attempting auto-reconnect...',
          className: 'status-disconnected',
          dotClass: 'dot-red',
        };
      case 'ERROR':
        return {
          label: 'ERROR',
          subText: 'Connection failed',
          className: 'status-error',
          dotClass: 'dot-red',
        };
      default:
        return {
          label: 'OFFLINE',
          subText: 'Disconnected',
          className: 'status-disconnected',
          dotClass: 'dot-red',
        };
    }
  };

  const status = getStatusConfig();
  const timeDisplay = lastUpdated || new Date().toLocaleTimeString();

  return (
    <header className="terminal-header">
      <div className="header-left">
        <div className="brand-icon-wrapper">
          <svg
            className="brand-icon"
            viewBox="0 0 24 24"
            width="28"
            height="28"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M2 12h4l3 8 4-16 3 8h6" />
          </svg>
        </div>
        <div className="brand-text">
          <h1 className="brand-title">Cash-Future Market</h1>
          <div className="brand-subtitle">NSE REAL-TIME TERMINAL</div>
        </div>
      </div>

      <div className="header-right">
        {/* Real-time Connection Quality */}
        <div className="connection-info">
          <span className={`status-dot ${status.dotClass}`}></span>
          <span className="status-live-text">{status.label}</span>
          <span className="status-separator">•</span>
          <span className="status-conn-text">{status.subText}</span>
          <span className="status-separator">•</span>
          <span className="status-latency-badge" title="WebSocket Ping/Pong Round-Trip Latency">
            Latency: <strong className={latency !== null && latency < 50 ? 'text-green' : 'text-amber'}>
              {latency !== null ? `${latency} ms` : '—'}
            </strong>
          </span>
          {reconnectCount > 0 && (
            <>
              <span className="status-separator">•</span>
              <span className="status-reconnect-badge">
                Reconnects: <strong>{reconnectCount}</strong>
              </span>
            </>
          )}
          {(connectionStatus === 'DISCONNECTED' || connectionStatus === 'ERROR') && onReconnect && (
            <button
              type="button"
              className="btn-retry"
              onClick={onReconnect}
              title="Click to reconnect WebSocket manually"
            >
              🔄 Retry
            </button>
          )}
        </div>

        {/* Market Stats Quick Trigger Button */}
        {onOpenStats && (
          <button
            type="button"
            className="header-stats-btn"
            onClick={onOpenStats}
            title="Open comprehensive market statistics"
            aria-label="Market Statistics"
          >
            📊 <span className="btn-text">Analytics</span>
          </button>
        )}

        {/* Theme Toggle Button */}
        <button
          type="button"
          className="theme-toggle-btn"
          onClick={onToggleTheme}
          title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          aria-label="Toggle theme"
        >
          <span className="theme-toggle-icon">{theme === 'dark' ? '☀️' : '🌙'}</span>
          <span className="theme-toggle-text">{theme === 'dark' ? 'Light' : 'Dark'}</span>
        </button>
      </div>
    </header>
  );
};

export default Header;
