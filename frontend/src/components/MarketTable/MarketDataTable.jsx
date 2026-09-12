import React, { useState, useEffect, useMemo, useCallback, useRef, forwardRef, useImperativeHandle } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ModuleRegistry, AllCommunityModule } from 'ag-grid-community';

// Import AG Grid styles
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-quartz.css';

// Register AG Grid Community modules for v36
ModuleRegistry.registerModules([AllCommunityModule]);

/**
 * Custom Cell Renderers & Formatters
 */

// Formatter for prices (2 decimal places with Indian currency formatting)
const formatPrice = (params) => {
  const val = params.value;
  if (val === undefined || val === null || val === '') return '-';
  const num = Number(val);
  if (isNaN(num)) return '-';
  return `₹${num.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

// Formatter for Futures contract expiry epoch timestamps
const formatExpiryDate = (params) => {
  const epoch = params.value;
  if (!epoch || epoch <= 0) return '-';
  const date = new Date(epoch * 1000);
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

// Custom renderer for Watchlist Star Icon
const WatchlistCellRenderer = (params) => {
  const symbol = params.data?.symbol;
  const watchlist = params.context?.watchlist || [];
  const isWatchlisted = watchlist.includes(symbol);

  return (
    <div className="watchlist-cell">
      <button
        type="button"
        className={`watchlist-star-btn ${isWatchlisted ? 'starred' : ''}`}
        onClick={(e) => {
          e.stopPropagation();
          if (params.context?.onToggleWatchlist && symbol) {
            params.context.onToggleWatchlist(symbol);
          }
        }}
        title={isWatchlisted ? 'Remove from Watchlist' : 'Add to Watchlist'}
        aria-label={`Toggle watchlist for ${symbol}`}
      >
        {isWatchlisted ? '★' : '☆'}
      </button>
    </div>
  );
};

// Custom renderer for the Symbol badge
const SymbolCellRenderer = (params) => {
  return (
    <div className="symbol-cell">
      <span className="symbol-text">{params.value || '-'}</span>
    </div>
  );
};

// Custom renderer for the Basis Spread pill (2 decimal places)
const SpreadCellRenderer = (params) => {
  const spread = params.value;
  if (spread === undefined || spread === null || spread === '') return '-';
  const num = Number(spread);
  if (isNaN(num)) return '-';
  const isPositive = num >= 0;
  const isHigh = Math.abs(num) >= 50;

  return (
    <div className={`spread-pill ${isPositive ? 'positive' : 'negative'} ${isHigh ? 'spread-high' : ''}`}>
      <span>{isPositive ? '+' : ''}{num.toFixed(2)}</span>
    </div>
  );
};

// Custom renderer for Buy Spread (Future Bid - Stock Ask)
const BuySpreadCellRenderer = (params) => {
  const spread = params.value;
  if (spread === undefined || spread === null || spread === '') return '-';
  const num = Number(spread);
  if (isNaN(num)) return '-';
  const isPositive = num >= 0;

  return (
    <div className={`spread-pill ${isPositive ? 'positive' : 'negative'}`}>
      <span>{isPositive ? '+' : ''}₹{num.toFixed(2)}</span>
    </div>
  );
};

// Custom renderer for Sell Spread (Stock Bid - Future Ask)
const SellSpreadCellRenderer = (params) => {
  const spread = params.value;
  if (spread === undefined || spread === null || spread === '') return '-';
  const num = Number(spread);
  if (isNaN(num)) return '-';
  const isPositive = num >= 0;

  return (
    <div className={`spread-pill ${isPositive ? 'positive' : 'negative'}`}>
      <span>{isPositive ? '+' : ''}₹{num.toFixed(2)}</span>
    </div>
  );
};

// Custom renderer for the Spread % badge (2 decimal places)
const SpreadPercentRenderer = (params) => {
  const pct = params.value;
  if (pct === undefined || pct === null || pct === '') return '-';
  const num = Number(pct);
  if (isNaN(num)) return '-';
  const isPositive = num >= 0;
  return (
    <span className={`spread-pct ${isPositive ? 'text-green' : 'text-red'}`}>
      {isPositive ? '+' : ''}{num.toFixed(2)}%
    </span>
  );
};

export const MarketDataTable = forwardRef(({
  rowData = [],
  quickFilterText = '',
  loading = false,
  theme = 'dark',
  watchlist = [],
  onToggleWatchlist,
  onSelectSymbol,
  selectedSymbol,
}, ref) => {
  const gridRef = useRef(null);

  // Local pagination state synced with AG Grid
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [rowCount, setRowCount] = useState(0);

  // Sync pagination state with AG Grid API
  const updatePaginationState = useCallback(() => {
    if (gridRef.current && gridRef.current.api) {
      const api = gridRef.current.api;
      setCurrentPage(api.paginationGetCurrentPage() || 0);
      setTotalPages(api.paginationGetTotalPages() || 1);
      setPageSize(api.paginationGetPageSize() || 20);
      setRowCount(api.paginationGetRowCount() || 0);
    }
  }, []);

  // Update pagination when rowData changes
  useEffect(() => {
    updatePaginationState();
  }, [rowData, updatePaginationState]);

  // Expose exportCsv method to parent component
  useImperativeHandle(ref, () => ({
    exportCsv: () => {
      if (gridRef.current && gridRef.current.api) {
        gridRef.current.api.exportDataAsCsv({
          fileName: `cash_future_market_data_${Date.now()}.csv`,
        });
      }
    },
  }));

  // Column definitions with grouped market segments & all required fields
  const columnDefs = useMemo(() => [
    {
      headerName: 'CONTRACT ASSET',
      headerClass: 'group-header-asset',
      children: [
        {
          headerName: '★',
          field: 'watchlist',
          pinned: 'left',
          width: 48,
          minWidth: 44,
          maxWidth: 54,
          sortable: false,
          filter: false,
          resizable: false,
          cellRenderer: WatchlistCellRenderer,
          cellClass: 'watchlist-column-cell',
          headerClass: 'col-header-asset',
        },
        {
          field: 'symbol',
          headerName: 'SYMBOL',
          pinned: 'left',
          width: 145,
          minWidth: 130,
          filter: 'agTextColumnFilter',
          cellRenderer: SymbolCellRenderer,
          cellClass: 'symbol-column-cell',
          headerClass: 'col-header-asset',
        },
      ],
    },
    {
      headerName: 'CASH MARKET — NSECM',
      marryChildren: true,
      headerClass: 'group-header-cash',
      children: [
        {
          field: 'cashContractName',
          headerName: 'CONTRACT',
          width: 140,
          minWidth: 125,
          filter: 'agTextColumnFilter',
          cellClass: 'contract-cell-cash',
          headerClass: 'col-header-cash',
        },
        {
          field: 'cashToken',
          headerName: 'TOKEN',
          width: 90,
          minWidth: 80,
          filter: 'agNumberColumnFilter',
          cellClass: 'token-cell text-mono',
          headerClass: 'col-header-cash',
        },
        {
          field: 'cashBid',
          headerName: 'CASH BID',
          width: 120,
          minWidth: 105,
          valueFormatter: formatPrice,
          type: 'numericColumn',
          cellClass: 'text-mono price-bid',
          headerClass: 'col-header-cash',
          enableCellChangeFlash: true,
        },
        {
          field: 'cashAsk',
          headerName: 'CASH ASK',
          width: 120,
          minWidth: 105,
          valueFormatter: formatPrice,
          type: 'numericColumn',
          cellClass: 'text-mono price-ask',
          headerClass: 'col-header-cash',
          enableCellChangeFlash: true,
        },
        {
          field: 'cashLtp',
          headerName: 'STOCK LTP',
          width: 130,
          minWidth: 115,
          valueFormatter: formatPrice,
          type: 'numericColumn',
          cellClass: 'price-ltp cash-ltp text-mono',
          headerClass: 'col-header-cash',
          enableCellChangeFlash: true,
        },
      ],
    },
    {
      headerName: 'FUTURES MARKET — NSEFO',
      marryChildren: true,
      headerClass: 'group-header-future',
      children: [
        {
          field: 'futureContractName',
          headerName: 'CONTRACT',
          width: 185,
          minWidth: 160,
          filter: 'agTextColumnFilter',
          cellClass: 'contract-cell-future',
          headerClass: 'col-header-future',
        },
        {
          field: 'futureToken',
          headerName: 'TOKEN',
          width: 90,
          minWidth: 80,
          filter: 'agNumberColumnFilter',
          cellClass: 'token-cell text-mono',
          headerClass: 'col-header-future',
        },
        {
          field: 'futureExpiry',
          headerName: 'EXPIRY',
          width: 120,
          minWidth: 105,
          valueFormatter: formatExpiryDate,
          cellClass: 'expiry-cell',
          headerClass: 'col-header-future',
        },
        {
          field: 'futureBid',
          headerName: 'FUT BID',
          width: 120,
          minWidth: 105,
          valueFormatter: formatPrice,
          type: 'numericColumn',
          cellClass: 'text-mono price-bid',
          headerClass: 'col-header-future',
          enableCellChangeFlash: true,
        },
        {
          field: 'futureAsk',
          headerName: 'FUT ASK',
          width: 120,
          minWidth: 105,
          valueFormatter: formatPrice,
          type: 'numericColumn',
          cellClass: 'text-mono price-ask',
          headerClass: 'col-header-future',
          enableCellChangeFlash: true,
        },
        {
          field: 'futureLtp',
          headerName: 'FUTURE LTP',
          width: 130,
          minWidth: 115,
          valueFormatter: formatPrice,
          type: 'numericColumn',
          cellClass: 'price-ltp future-ltp text-mono',
          headerClass: 'col-header-future',
          enableCellChangeFlash: true,
        },
      ],
    },
    {
      headerName: 'SPREADS & ARBITRAGE',
      marryChildren: true,
      headerClass: 'group-header-analytics',
      children: [
        {
          field: 'buySpread',
          headerName: 'BUY SPREAD',
          width: 135,
          minWidth: 120,
          type: 'numericColumn',
          cellRenderer: BuySpreadCellRenderer,
          headerClass: 'col-header-analytics',
          enableCellChangeFlash: true,
        },
        {
          field: 'sellSpread',
          headerName: 'SELL SPREAD',
          width: 135,
          minWidth: 120,
          type: 'numericColumn',
          cellRenderer: SellSpreadCellRenderer,
          headerClass: 'col-header-analytics',
          enableCellChangeFlash: true,
        },
        {
          field: 'spread',
          headerName: 'BASIS SPREAD',
          width: 135,
          minWidth: 120,
          type: 'numericColumn',
          cellRenderer: SpreadCellRenderer,
          headerClass: 'col-header-analytics',
          enableCellChangeFlash: true,
          sort: 'desc',
        },
        {
          field: 'spreadPercent',
          headerName: 'SPREAD %',
          width: 110,
          minWidth: 95,
          type: 'numericColumn',
          cellRenderer: SpreadPercentRenderer,
          headerClass: 'col-header-analytics',
          enableCellChangeFlash: true,
        },
        {
          field: 'lastUpdated',
          headerName: 'UPDATED',
          width: 110,
          minWidth: 95,
          cellClass: 'last-updated-cell text-small',
          headerClass: 'col-header-analytics',
        },
      ],
    },
  ], []);

  // Default column properties
  const defaultColDef = useMemo(() => ({
    sortable: true,
    filter: true,
    resizable: true,
    floatingFilter: false,
  }), []);

  // Unique Row Identifier for high-speed AG Grid delta updates without duplicates
  const getRowId = useCallback((params) => params.data.symbol, []);

  // Dynamic AG Grid class based on selected theme
  const gridThemeClass = theme === 'dark' ? 'ag-theme-quartz-dark' : 'ag-theme-quartz';

  // Context passed to AG Grid cell renderers
  const gridContext = useMemo(() => ({
    watchlist,
    onToggleWatchlist,
  }), [watchlist, onToggleWatchlist]);

  // Handle row click to open Market Detail Drawer
  const handleRowClick = useCallback((event) => {
    if (onSelectSymbol && event.data && event.data.symbol) {
      onSelectSymbol(event.data.symbol);
    }
  }, [onSelectSymbol]);

  // Pagination navigation actions
  const handlePageSizeChange = useCallback((e) => {
    const newSize = Number(e.target.value);
    setPageSize(newSize);
    if (gridRef.current && gridRef.current.api) {
      gridRef.current.api.paginationSetPageSize(newSize);
    }
  }, []);

  const handleFirstPage = useCallback(() => {
    if (gridRef.current && gridRef.current.api) {
      gridRef.current.api.paginationGoToFirstPage();
    }
  }, []);

  const handlePrevPage = useCallback(() => {
    if (gridRef.current && gridRef.current.api) {
      gridRef.current.api.paginationGoToPreviousPage();
    }
  }, []);

  const handleNextPage = useCallback(() => {
    if (gridRef.current && gridRef.current.api) {
      gridRef.current.api.paginationGoToNextPage();
    }
  }, []);

  const handleLastPage = useCallback(() => {
    if (gridRef.current && gridRef.current.api) {
      gridRef.current.api.paginationGoToLastPage();
    }
  }, []);

  const handlePageClick = useCallback((pageNumber) => {
    if (gridRef.current && gridRef.current.api) {
      gridRef.current.api.paginationGoToPage(pageNumber - 1);
    }
  }, []);

  // Calculate current range (e.g. 61–80 of 102)
  const startRow = rowCount === 0 ? 0 : currentPage * pageSize + 1;
  const endRow = Math.min((currentPage + 1) * pageSize, rowCount);

  // Compute page numbers array (e.g. [1, 2, 3, 4, 5, 6])
  const pageNumbers = useMemo(() => {
    if (totalPages <= 0) return [1];
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    const current1 = currentPage + 1;
    let start = Math.max(1, current1 - 2);
    let end = Math.min(totalPages, start + 5);
    if (end - start < 5) {
      start = Math.max(1, end - 5);
    }
    const pages = [];
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  }, [currentPage, totalPages]);

  return (
    <div className="market-table-container">
      <div className="table-top-header">
        <div className="table-title-area">
          <h2 className="table-title">Live Cash-Future Pairs</h2>
          <span className="pairs-loaded-pill">{rowData.length} Pairs Loaded</span>
        </div>
        <div className="table-hint-text">
          <span>💡 Click any row to open Market Detail Drawer</span>
        </div>
      </div>

      <div className={`${gridThemeClass} custom-grid-wrapper`} style={{ height: '580px', width: '100%' }}>
        <AgGridReact
          ref={gridRef}
          rowData={rowData}
          getRowId={getRowId}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          quickFilterText={quickFilterText}
          context={gridContext}
          loading={loading}
          pagination={true}
          paginationPageSize={pageSize}
          suppressPaginationPanel={true}
          onPaginationChanged={updatePaginationState}
          onGridReady={updatePaginationState}
          onRowClicked={handleRowClick}
          rowHeight={42}
          headerHeight={38}
          groupHeaderHeight={34}
          animateRows={true}
          suppressCellFocus={true}
          rowSelection="single"
        />
      </div>

      {/* PROFESSIONAL DATA GRID PAGINATION FOOTER */}
      <div className="grid-pagination-footer" role="navigation" aria-label="Table Pagination">
        <div className="pagination-left">
          <label htmlFor="grid-page-size-select" className="page-size-label">Page size:</label>
          <div className="page-size-select-wrapper">
            <select
              id="grid-page-size-select"
              className="page-size-select"
              value={pageSize}
              onChange={handlePageSizeChange}
              aria-label="Select page size"
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={250}>250</option>
            </select>
          </div>
          <span className="pagination-range-text">
            {startRow}–{endRow} of {rowCount}
          </span>
        </div>

        <div className="pagination-right">
          <button
            type="button"
            className="pagination-btn pagination-nav-btn"
            onClick={handleFirstPage}
            disabled={currentPage === 0}
            title="First Page"
            aria-label="First Page"
          >
            «
          </button>
          <button
            type="button"
            className="pagination-btn pagination-nav-btn"
            onClick={handlePrevPage}
            disabled={currentPage === 0}
            title="Previous Page"
            aria-label="Previous Page"
          >
            ‹
          </button>

          {pageNumbers.map((p) => {
            const isActive = p === currentPage + 1;
            return (
              <button
                key={p}
                type="button"
                className={`pagination-btn pagination-num-btn ${isActive ? 'active' : ''}`}
                onClick={() => handlePageClick(p)}
                aria-current={isActive ? 'page' : undefined}
                title={`Page ${p}`}
              >
                {p}
              </button>
            );
          })}

          <button
            type="button"
            className="pagination-btn pagination-nav-btn"
            onClick={handleNextPage}
            disabled={currentPage >= totalPages - 1 || totalPages === 0}
            title="Next Page"
            aria-label="Next Page"
          >
            ›
          </button>
          <button
            type="button"
            className="pagination-btn pagination-nav-btn"
            onClick={handleLastPage}
            disabled={currentPage >= totalPages - 1 || totalPages === 0}
            title="Last Page"
            aria-label="Last Page"
          >
            »
          </button>
        </div>
      </div>
    </div>
  );
});

export default MarketDataTable;
