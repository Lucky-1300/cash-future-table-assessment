import React, { useState, useEffect, useMemo, useRef } from 'react';
import Header from './components/Header/Header';
import MarketDataTable from './components/MarketTable/MarketDataTable';
import TopArbitrage from './components/TopArbitrage/TopArbitrage';
import MarketDetailDrawer from './components/MarketDetailDrawer/MarketDetailDrawer';
import MarketStatsModal from './components/MarketStats/MarketStatsModal';
import StatusBar from './components/StatusBar/StatusBar';
import { useWebSocketMarketData } from './hooks/useWebSocketMarketData';
import './App.css';

function App() {
  // Theme state persisted in localStorage (default to 'dark')
  const [theme, setTheme] = useState(() => {
    try {
      const savedTheme = localStorage.getItem('cash_future_theme');
      return savedTheme === 'light' ? 'light' : 'dark';
    } catch (e) {
      return 'dark';
    }
  });

  // Watchlist persisted in localStorage
  const [watchlist, setWatchlist] = useState(() => {
    try {
      const saved = localStorage.getItem('cash_future_watchlist');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  // Apply theme to document root on change
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem('cash_future_theme', theme);
    } catch (e) {}
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const toggleWatchlist = (symbol) => {
    setWatchlist((prev) => {
      const next = prev.includes(symbol)
        ? prev.filter((s) => s !== symbol)
        : [...prev, symbol];
      try {
        localStorage.setItem('cash_future_watchlist', JSON.stringify(next));
      } catch (e) {}
      return next;
    });
  };

  const {
    marketData,
    connectionStatus,
    errorStatus,
    tickCount,
    ticksPerSec,
    activePairsCount,
    latency,
    reconnectCount,
    lastUpdated,
    reconnect,
  } = useWebSocketMarketData();

  // Search and Advanced Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFilter, setSelectedFilter] = useState('ALL'); // 'ALL' | 'HIGH_SPREAD' | 'POSITIVE' | 'NEGATIVE' | 'STOCKS' | 'WATCHLIST'
  const [minSpreadInput, setMinSpreadInput] = useState('');

  // Selected Symbol for Right-side Detail Drawer
  const [selectedSymbol, setSelectedSymbol] = useState(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Market Statistics Modal
  const [isStatsOpen, setIsStatsOpen] = useState(false);

  const tableRef = useRef(null);

  const handleSelectSymbol = (symbol) => {
    setSelectedSymbol(symbol);
    setIsDrawerOpen(true);
  };

  const handleCloseDrawer = () => {
    setIsDrawerOpen(false);
  };

  // Filtered rows calculation
  const filteredData = useMemo(() => {
    let list = marketData;

    if (selectedFilter === 'HIGH_SPREAD') {
      list = list.filter((item) => (item.spread || 0) > 5);
    } else if (selectedFilter === 'POSITIVE') {
      list = list.filter((item) => item.spread !== null && item.spread > 0);
    } else if (selectedFilter === 'NEGATIVE') {
      list = list.filter((item) => item.spread !== null && item.spread < 0);
    } else if (selectedFilter === 'STOCKS') {
      list = list.filter((item) => item.symbol !== 'BANKNIFTY');
    } else if (selectedFilter === 'WATCHLIST') {
      list = list.filter((item) => watchlist.includes(item.symbol));
    }

    if (minSpreadInput.trim() !== '' && !isNaN(Number(minSpreadInput))) {
      const threshold = Number(minSpreadInput);
      list = list.filter((item) => (item.spread || 0) >= threshold);
    }

    return list;
  }, [marketData, selectedFilter, minSpreadInput, watchlist]);

  // Summary Metrics
  const metrics = useMemo(() => {
    if (marketData.length === 0) return { avgSpread: 0, highestSpread: null, totalPairs: 0 };
    const totalSpread = marketData.reduce((acc, curr) => acc + (curr.spread || 0), 0);
    const highest = [...marketData].sort((a, b) => (b.spread || 0) - (a.spread || 0))[0];

    return {
      avgSpread: totalSpread / marketData.length,
      highestSpread: highest,
      totalPairs: marketData.length,
    };
  }, [marketData]);

  const isLoading = connectionStatus === 'CONNECTING' && marketData.length === 0;

  const handleExportCsv = () => {
    if (tableRef.current && tableRef.current.exportCsv) {
      tableRef.current.exportCsv();
    }
  };

  return (
    <div className={`terminal-app theme-${theme}`} data-theme={theme}>
      <Header
        totalPairs={metrics.totalPairs}
        averageSpread={metrics.avgSpread}
        connectionStatus={connectionStatus}
        tickCount={tickCount}
        latency={latency}
        reconnectCount={reconnectCount}
        lastUpdated={lastUpdated}
        theme={theme}
        onToggleTheme={toggleTheme}
        onReconnect={reconnect}
        onOpenStats={() => setIsStatsOpen(true)}
      />

      <main className="dashboard-content">
        {/* Connection Alert Notice if offline */}
        {(connectionStatus === 'DISCONNECTED' || connectionStatus === 'ERROR') && (
          <div className="connection-alert-banner">
            <span className="alert-icon">⚠️</span>
            <span className="alert-text">
              WebSocket disconnected from <code>ws://localhost:5000</code>. {errorStatus ? `(${errorStatus})` : 'Attempting auto-reconnect...'}
            </span>
            <button type="button" className="btn-alert-reconnect" onClick={reconnect}>
              Reconnect Now
            </button>
          </div>
        )}

        {/* 4 Metric Cards Banner */}
        <section className="metrics-banner">
          {/* Card 1 - CASH SEGMENT */}
          <div className="metric-card card-cash">
            <div className="card-header-row">
              <span className="card-icon icon-cash">⊞</span>
              <span className="card-title">CASH SEGMENT</span>
            </div>
            <div className="card-value value-cash">{metrics.totalPairs} Equities</div>
            <div className="card-sub">Primary Cash Underlyings</div>
          </div>

          {/* Card 2 - FUTURES SEGMENT */}
          <div className="metric-card card-future">
            <div className="card-header-row">
              <span className="card-icon icon-future">📈</span>
              <span className="card-title">FUTURES SEGMENT</span>
            </div>
            <div className="card-value value-future">{metrics.totalPairs} Futures</div>
            <div className="card-sub">Stock & Index Derivatives</div>
          </div>

          {/* Card 3 - MAX BASIS SPREAD */}
          <div className="metric-card card-spread">
            <div className="card-header-row">
              <span className="card-icon icon-spread">+</span>
              <span className="card-title">MAX BASIS SPREAD</span>
            </div>
            <div className="card-value value-spread">
              {metrics.highestSpread?.symbol || 'N/A'}: {metrics.highestSpread?.spread !== undefined && metrics.highestSpread?.spread !== null ? `${metrics.highestSpread.spread >= 0 ? '+' : ''}${metrics.highestSpread.spread.toFixed(2)}` : '+0.00'}
            </div>
            <div className="card-sub">Max Basis Arbitrage Spread</div>
          </div>

          {/* Card 4 - LIVE FEED (Enhanced with Ticks/sec & Active Pairs) */}
          <div className="metric-card card-feed">
            <div className="card-header-row">
              <span className="card-icon icon-feed">⏱</span>
              <span className="card-title">LIVE FEED</span>
            </div>
            <div className="card-value value-feed">
              {connectionStatus === 'CONNECTED' ? `${ticksPerSec.toLocaleString()} ticks/sec` : connectionStatus}
            </div>
            <div className="card-sub">
              <span className="sub-dot">🟢</span> {tickCount.toLocaleString()} Ticks • {activePairsCount}/{metrics.totalPairs} Pairs Live
            </div>
          </div>
        </section>

        {/* Unified Search & Advanced Filters Toolbar */}
        <div className="table-controls-bar">
          <div className="search-box">
            <span className="search-icon">🔍</span>
            <input
              type="text"
              placeholder="Search symbol, contract name or token..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
            {searchTerm && (
              <button
                type="button"
                className="clear-search"
                onClick={() => setSearchTerm('')}
                title="Clear search"
              >
                ✕
              </button>
            )}
          </div>

          <div className="filter-pill-group">
            <button
              type="button"
              className={`filter-btn ${selectedFilter === 'ALL' ? 'active' : ''}`}
              onClick={() => setSelectedFilter('ALL')}
            >
              All Pairs ({marketData.length})
            </button>
            <button
              type="button"
              className={`filter-btn ${selectedFilter === 'HIGH_SPREAD' ? 'active' : ''}`}
              onClick={() => setSelectedFilter('HIGH_SPREAD')}
            >
              High Spread (&gt; 5 pts)
            </button>
            <button
              type="button"
              className={`filter-btn ${selectedFilter === 'POSITIVE' ? 'active' : ''}`}
              onClick={() => setSelectedFilter('POSITIVE')}
            >
              Positive Spread
            </button>
            <button
              type="button"
              className={`filter-btn ${selectedFilter === 'NEGATIVE' ? 'active' : ''}`}
              onClick={() => setSelectedFilter('NEGATIVE')}
            >
              Negative Spread
            </button>
            <button
              type="button"
              className={`filter-btn ${selectedFilter === 'STOCKS' ? 'active' : ''}`}
              onClick={() => setSelectedFilter('STOCKS')}
            >
              Single Stocks
            </button>
            <button
              type="button"
              className={`filter-btn ${selectedFilter === 'WATCHLIST' ? 'active' : ''}`}
              onClick={() => setSelectedFilter('WATCHLIST')}
            >
              ⭐ Watchlist ({watchlist.length})
            </button>

            {/* Minimum Spread Filter Input */}
            <div className="min-spread-filter-wrapper">
              <span className="min-spread-label">Min Spread: ₹</span>
              <input
                type="number"
                placeholder="0"
                value={minSpreadInput}
                onChange={(e) => setMinSpreadInput(e.target.value)}
                className="min-spread-input"
                title="Filter rows by minimum basis spread"
              />
              {minSpreadInput && (
                <button
                  type="button"
                  className="min-spread-clear-btn"
                  onClick={() => setMinSpreadInput('')}
                  title="Clear minimum spread filter"
                >
                  ✕
                </button>
              )}
            </div>

            <button
              type="button"
              className="btn-export"
              onClick={handleExportCsv}
              title="Export table data as CSV"
            >
              ⬇ Export CSV
            </button>
          </div>
        </div>

        {/* Top Arbitrage Opportunities Component */}
        <TopArbitrage
          marketData={marketData}
          onSelectSymbol={handleSelectSymbol}
        />

        {/* AG Grid Market Data Table */}
        <MarketDataTable
          ref={tableRef}
          rowData={filteredData}
          quickFilterText={searchTerm}
          loading={isLoading}
          theme={theme}
          watchlist={watchlist}
          onToggleWatchlist={toggleWatchlist}
          onSelectSymbol={handleSelectSymbol}
          selectedSymbol={selectedSymbol}
        />

        {/* Bottom Application Status Bar */}
        <StatusBar
          connectionStatus={connectionStatus}
          totalPairs={metrics.totalPairs}
          activePairs={activePairsCount}
          ticksPerSec={ticksPerSec}
          tickCount={tickCount}
          latency={latency}
          reconnectCount={reconnectCount}
          lastUpdated={lastUpdated}
        />
      </main>

      {/* Market Detail Drawer (Slide-in right panel) */}
      <MarketDetailDrawer
        isOpen={isDrawerOpen}
        symbol={selectedSymbol}
        marketData={marketData}
        onClose={handleCloseDrawer}
        isWatchlisted={watchlist.includes(selectedSymbol)}
        onToggleWatchlist={toggleWatchlist}
      />

      {/* Comprehensive Market Statistics Modal */}
      <MarketStatsModal
        isOpen={isStatsOpen}
        marketData={marketData}
        onClose={() => setIsStatsOpen(false)}
      />
    </div>
  );
}

export default App;
