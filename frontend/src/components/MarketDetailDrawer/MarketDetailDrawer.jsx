import React, { useEffect } from 'react';

const formatPrice = (val) => {
  if (val === undefined || val === null || val === '') return '-';
  const num = Number(val);
  if (isNaN(num)) return '-';
  return `₹${num.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const formatExpiryDate = (epoch) => {
  if (!epoch || epoch <= 0) return '-';
  const date = new Date(epoch * 1000);
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

export const MarketDetailDrawer = ({
  isOpen = false,
  symbol = null,
  marketData = [],
  onClose,
  isWatchlisted = false,
  onToggleWatchlist,
}) => {
  // Find current live record for the selected symbol
  const pair = marketData.find((p) => p.symbol === symbol) || null;

  // Close on Escape key press
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Prevent background scroll on small screens when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen || !symbol) return null;

  const isPositive = (pair?.spread || 0) >= 0;

  return (
    <div className="drawer-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="market-drawer-content"
        onClick={(e) => e.stopPropagation()}
        role="document"
      >
        {/* Drawer Header */}
        <div className="drawer-header">
          <div className="drawer-header-left">
            <div className="drawer-title-row">
              <h2 className="drawer-symbol-title">{symbol}</h2>
              {onToggleWatchlist && (
                <button
                  type="button"
                  className={`drawer-watchlist-btn ${isWatchlisted ? 'active' : ''}`}
                  onClick={() => onToggleWatchlist(symbol)}
                  title={isWatchlisted ? 'Remove from Watchlist' : 'Add to Watchlist'}
                  aria-label="Toggle Watchlist"
                >
                  {isWatchlisted ? '★' : '☆'}
                </button>
              )}
            </div>
            <div className="drawer-live-badge">
              <span className="drawer-live-dot">●</span>
              <span className="drawer-live-text">LIVE</span>
            </div>
          </div>
          <button
            type="button"
            className="drawer-close-btn"
            onClick={onClose}
            title="Close Drawer (Esc)"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {pair ? (
          <div className="drawer-body">
            {/* 1. CASH MARKET SECTION */}
            <div className="drawer-section drawer-cash-section">
              <div className="drawer-section-header">
                <span className="drawer-section-icon icon-cash">⊞</span>
                <span className="drawer-section-title">CASH MARKET (NSECM)</span>
              </div>
              <div className="drawer-meta-row">
                <div className="drawer-meta-item">
                  <span className="drawer-meta-label">Contract:</span>
                  <span className="drawer-meta-val">{pair.cashContractName || symbol}</span>
                </div>
                <div className="drawer-meta-item">
                  <span className="drawer-meta-label">Token:</span>
                  <span className="drawer-meta-val text-mono">{pair.cashToken || '-'}</span>
                </div>
              </div>
              <div className="drawer-price-grid">
                <div className="drawer-price-card highlight-ltp">
                  <span className="price-label">CASH LTP</span>
                  <span className="price-val cash-ltp-val text-mono">{formatPrice(pair.cashLtp)}</span>
                </div>
                <div className="drawer-price-card">
                  <span className="price-label">BID</span>
                  <span className="price-val text-mono">{formatPrice(pair.cashBid)}</span>
                </div>
                <div className="drawer-price-card">
                  <span className="price-label">ASK</span>
                  <span className="price-val text-mono">{formatPrice(pair.cashAsk)}</span>
                </div>
              </div>
            </div>

            {/* 2. FUTURES MARKET SECTION */}
            <div className="drawer-section drawer-future-section">
              <div className="drawer-section-header">
                <span className="drawer-section-icon icon-future">📈</span>
                <span className="drawer-section-title">FUTURES MARKET (NSEFO)</span>
              </div>
              <div className="drawer-meta-row">
                <div className="drawer-meta-item">
                  <span className="drawer-meta-label">Contract:</span>
                  <span className="drawer-meta-val">{pair.futureContractName || '-'}</span>
                </div>
                <div className="drawer-meta-item">
                  <span className="drawer-meta-label">Token:</span>
                  <span className="drawer-meta-val text-mono">{pair.futureToken || '-'}</span>
                </div>
                <div className="drawer-meta-item">
                  <span className="drawer-meta-label">Expiry:</span>
                  <span className="drawer-meta-val">{formatExpiryDate(pair.futureExpiry)}</span>
                </div>
              </div>
              <div className="drawer-price-grid">
                <div className="drawer-price-card highlight-ltp">
                  <span className="price-label">FUT LTP</span>
                  <span className="price-val future-ltp-val text-mono">{formatPrice(pair.futureLtp)}</span>
                </div>
                <div className="drawer-price-card">
                  <span className="price-label">BID</span>
                  <span className="price-val text-mono">{formatPrice(pair.futureBid)}</span>
                </div>
                <div className="drawer-price-card">
                  <span className="price-label">ASK</span>
                  <span className="price-val text-mono">{formatPrice(pair.futureAsk)}</span>
                </div>
              </div>
            </div>

            {/* 3. ARBITRAGE & SPREAD ANALYTICS */}
            <div className="drawer-section drawer-analytics-section">
              <div className="drawer-section-header">
                <span className="drawer-section-icon icon-spread">⚡</span>
                <span className="drawer-section-title">ARBITRAGE & SPREAD ANALYTICS</span>
              </div>
              <div className="drawer-analytics-grid">
                <div className="analytics-card">
                  <span className="analytics-label">BASIS SPREAD</span>
                  <span className={`analytics-val text-mono ${isPositive ? 'text-green' : 'text-red'}`}>
                    {isPositive ? '+' : ''}{formatPrice(pair.spread)}
                  </span>
                  <span className="analytics-sub">Futures LTP - Cash LTP</span>
                </div>
                <div className="analytics-card">
                  <span className="analytics-label">SPREAD PERCENT</span>
                  <span className={`analytics-val text-mono ${isPositive ? 'text-green' : 'text-red'}`}>
                    {isPositive ? '+' : ''}{Number(pair.spreadPercent || 0).toFixed(2)}%
                  </span>
                  <span className="analytics-sub">(Spread / Cash LTP) × 100</span>
                </div>
                <div className="analytics-card">
                  <span className="analytics-label">LAST UPDATED</span>
                  <span className="analytics-val text-mono text-muted-val">{pair.lastUpdated || '-'}</span>
                  <span className="analytics-sub">Real-time WebSocket Timestamp</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="drawer-empty-state">
            <p>Awaiting live market data for {symbol}...</p>
          </div>
        )}

        {/* Drawer Footer */}
        <div className="drawer-footer">
          <span className="drawer-footer-text">
            🟢 Connected to Live Native WebSocket Feed (Port 5000)
          </span>
          <button type="button" className="drawer-footer-close-btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default MarketDetailDrawer;
