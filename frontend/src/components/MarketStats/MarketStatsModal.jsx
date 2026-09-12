import React, { useMemo } from 'react';

const formatPrice = (val) => {
  if (val === undefined || val === null || val === '') return '-';
  const num = Number(val);
  if (isNaN(num)) return '-';
  return `₹${num.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

export const MarketStatsModal = ({ isOpen = false, marketData = [], onClose }) => {
  const stats = useMemo(() => {
    if (!marketData || marketData.length === 0) {
      return {
        totalPairs: 0,
        positiveCount: 0,
        negativeCount: 0,
        zeroCount: 0,
        avgSpread: 0,
        maxSpread: null,
        minSpread: null,
        activePricesCount: 0,
      };
    }

    let positiveCount = 0;
    let negativeCount = 0;
    let zeroCount = 0;
    let totalSpread = 0;
    let validSpreadCount = 0;
    let activePricesCount = 0;

    let maxSpread = null;
    let minSpread = null;

    for (const p of marketData) {
      if (p.cashLtp !== null || p.futureLtp !== null) {
        activePricesCount++;
      }

      if (p.spread !== null && Number.isFinite(p.spread)) {
        validSpreadCount++;
        totalSpread += p.spread;

        if (p.spread > 0) positiveCount++;
        else if (p.spread < 0) negativeCount++;
        else zeroCount++;

        if (maxSpread === null || p.spread > maxSpread.spread) {
          maxSpread = p;
        }
        if (minSpread === null || p.spread < minSpread.spread) {
          minSpread = p;
        }
      }
    }

    const avgSpread = validSpreadCount > 0 ? totalSpread / validSpreadCount : 0;

    return {
      totalPairs: marketData.length,
      positiveCount,
      negativeCount,
      zeroCount,
      avgSpread,
      maxSpread,
      minSpread,
      activePricesCount,
    };
  }, [marketData]);

  if (!isOpen) return null;

  return (
    <div className="stats-modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="stats-modal-content"
        onClick={(e) => e.stopPropagation()}
        role="document"
      >
        <div className="stats-modal-header">
          <div className="stats-modal-title-area">
            <span className="stats-header-icon">📊</span>
            <h2 className="stats-modal-title">Live Market Analytics & Statistics</h2>
          </div>
          <button
            type="button"
            className="stats-modal-close-btn"
            onClick={onClose}
            title="Close"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="stats-modal-body">
          <div className="stats-cards-grid">
            {/* 1. Total Pairs */}
            <div className="stats-metric-card">
              <span className="stats-metric-label">TOTAL PAIRED CONTRACTS</span>
              <span className="stats-metric-val">{stats.totalPairs}</span>
              <span className="stats-metric-sub">{stats.activePricesCount} Active Live Feed</span>
            </div>

            {/* 2. Positive Spread */}
            <div className="stats-metric-card border-green">
              <span className="stats-metric-label">POSITIVE SPREAD (PREMIUM)</span>
              <span className="stats-metric-val text-green">{stats.positiveCount}</span>
              <span className="stats-metric-sub">Futures trading at premium</span>
            </div>

            {/* 3. Negative Spread */}
            <div className="stats-metric-card border-red">
              <span className="stats-metric-label">NEGATIVE SPREAD (DISCOUNT)</span>
              <span className="stats-metric-val text-red">{stats.negativeCount}</span>
              <span className="stats-metric-sub">Futures trading at discount</span>
            </div>

            {/* 4. Average Basis Spread */}
            <div className="stats-metric-card">
              <span className="stats-metric-label">AVERAGE BASIS SPREAD</span>
              <span className={`stats-metric-val ${stats.avgSpread >= 0 ? 'text-green' : 'text-red'}`}>
                {stats.avgSpread >= 0 ? '+' : ''}{formatPrice(stats.avgSpread)}
              </span>
              <span className="stats-metric-sub">Mean across all live contracts</span>
            </div>

            {/* 5. Maximum Spread */}
            <div className="stats-metric-card border-green">
              <span className="stats-metric-label">MAXIMUM BASIS SPREAD</span>
              <span className="stats-metric-val text-green">
                {stats.maxSpread ? `+${formatPrice(stats.maxSpread.spread)}` : '-'}
              </span>
              <span className="stats-metric-sub">
                {stats.maxSpread ? `Symbol: ${stats.maxSpread.symbol} (+${Number(stats.maxSpread.spreadPercent || 0).toFixed(2)}%)` : 'None'}
              </span>
            </div>

            {/* 6. Minimum Spread */}
            <div className="stats-metric-card border-red">
              <span className="stats-metric-label">MINIMUM BASIS SPREAD</span>
              <span className="stats-metric-val text-red">
                {stats.minSpread ? `${stats.minSpread.spread >= 0 ? '+' : ''}${formatPrice(stats.minSpread.spread)}` : '-'}
              </span>
              <span className="stats-metric-sub">
                {stats.minSpread ? `Symbol: ${stats.minSpread.symbol} (${Number(stats.minSpread.spreadPercent || 0).toFixed(2)}%)` : 'None'}
              </span>
            </div>
          </div>
        </div>

        <div className="stats-modal-footer">
          <span className="stats-footer-note">
            ⚡ Automatically computed in real-time from PostgreSQL-paired Cash-Future WebSocket stream.
          </span>
          <button type="button" className="stats-footer-btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default MarketStatsModal;
