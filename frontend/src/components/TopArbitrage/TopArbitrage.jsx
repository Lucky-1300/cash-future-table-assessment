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

export const TopArbitrage = ({ marketData = [], onSelectSymbol }) => {
  // Compute top 4 positive spread opportunities dynamically from live market data
  const topOpportunities = useMemo(() => {
    return marketData
      .filter((p) => p.spread !== null && p.spread > 0 && p.cashLtp > 0 && p.futureLtp > 0)
      .sort((a, b) => b.spread - a.spread)
      .slice(0, 4);
  }, [marketData]);

  if (topOpportunities.length === 0) {
    return null;
  }

  return (
    <section className="top-arbitrage-container" aria-label="Top Arbitrage Opportunities">
      <div className="top-arbitrage-header">
        <span className="arbitrage-flame-icon">🔥</span>
        <span className="top-arbitrage-title">TOP ARBITRAGE OPPORTUNITIES</span>
        <span className="top-arbitrage-badge">LIVE SPREAD LEADERBOARD</span>
      </div>

      <div className="top-arbitrage-grid">
        {topOpportunities.map((item, idx) => {
          const isPositive = (item.spread || 0) >= 0;
          return (
            <div
              key={item.symbol}
              className="arbitrage-card"
              onClick={() => onSelectSymbol && onSelectSymbol(item.symbol)}
              title={`Click to view ${item.symbol} live market details`}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  onSelectSymbol && onSelectSymbol(item.symbol);
                }
              }}
            >
              <div className="arbitrage-rank">#{idx + 1}</div>
              <div className="arbitrage-symbol-col">
                <span className="arbitrage-symbol">{item.symbol}</span>
                <span className="arbitrage-sub">
                  Cash: {formatPrice(item.cashLtp)} • Fut: {formatPrice(item.futureLtp)}
                </span>
              </div>
              <div className="arbitrage-spread-col">
                <span className="arbitrage-spread-val">
                  {isPositive ? '+' : ''}{formatPrice(item.spread)}
                </span>
                <span className="arbitrage-pct-pill">
                  {isPositive ? '+' : ''}{Number(item.spreadPercent || 0).toFixed(2)}%
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};

export default TopArbitrage;
