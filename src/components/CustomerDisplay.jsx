import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Maximize,
  Minimize,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Flame,
  FileText,
  ArrowRight,
  Building2,
  MapPin,
  ShoppingBag,
  QrCode,
  Download,
  PhoneCall,
} from 'lucide-react';
import {
  fetchLiveOrdersForDisplay,
  filterCustomerOrders,
  getPublicHotels,
  connectCustomerDisplay,
} from '../services/customerDisplayService';
import { calculateOrderETA } from '../utils/preparationTime';
import { useFullscreen } from '../hooks/useFullscreen';
import { useWakeLock } from '../hooks/useWakeLock';
import '../styles/customer-display.css';

/**
 * Dedicated Customer-Facing Order Row (Airport Board Style)
 * Strictly contains:
 * 1. Bill Number (#32249) aligned LEFT (Huge bold 3.2rem font)
 *    If phone/app order: includes estimated time badge
 * 2. Status Badge (BILLED / PREPARING / READY FOR PICKUP) aligned RIGHT (Large bold pill badge)
 * Estimated time is completely removed for walk-in cashier bills!
 */
const CustomerDisplayRow = React.memo(function CustomerDisplayRow({
  order,
  isNewlyArrived,
  queueIndex = 0,
  isEven = false,
}) {
  const status = (order.status || '').toUpperCase();
  const isReady = status === 'READY';
  const isPreparing = status === 'PREPARING';

  // Check if order was placed through phone / mobile app
  const isPhone = useMemo(() => {
    if (!order) return false;
    const src = (order.order_source || order.source || order.channel || '').toString().toUpperCase().trim();
    if (
      src === 'CUSTOMER_APP' ||
      src === 'APP' ||
      src === 'PHONE' ||
      src === 'PHONE_ORDER' ||
      src === 'MOBILE' ||
      src === 'ONLINE'
    ) {
      return true;
    }
    if (order.is_phone_order === true || order.phone_order === true) {
      return true;
    }
    if (src === 'CASHIER_POS' || src === 'POS' || src === 'COUNTER') {
      return false;
    }
    const oType = (order.order_type || '').toString().toLowerCase().trim();
    if (oType.includes('phone') || oType.includes('app') || oType.includes('online')) {
      return true;
    }
    return false;
  }, [order]);

  // Calculate ETA only if phone order
  const etaText = useMemo(() => {
    if (!isPhone) return null;
    if (isReady) return 'READY';
    return calculateOrderETA(order, queueIndex);
  }, [order, queueIndex, isReady, isPhone]);

  const billNum = order.bill_no !== null && order.bill_no !== undefined
    ? order.bill_no
    : (order.id || order.order_id);

  let rowClass = 'row-billed';
  let statusBadgeClass = 'badge-status-billed';
  let StatusIcon = FileText;
  let statusLabel = 'BILLED';

  if (isReady) {
    rowClass = 'row-ready';
    statusBadgeClass = 'badge-status-ready';
    StatusIcon = CheckCircle2;
    statusLabel = 'READY FOR PICKUP';
  } else if (isPreparing) {
    rowClass = 'row-preparing';
    statusBadgeClass = 'badge-status-preparing';
    StatusIcon = Flame;
    statusLabel = 'PREPARING';
  }

  return (
    <div
      className={`tv-board-row ${rowClass} ${isEven ? 'row-even' : 'row-odd'} ${isNewlyArrived ? 'tv-row-new' : ''}`}
      data-order-id={order.order_id || order.id}
    >
      {/* 1. Left: Bill Number & Phone Order ETA if applicable */}
      <div className="tv-row-bill">
        <div className="tv-row-bill-main">
          <span className="tv-row-hash">#</span>
          <span className="tv-row-number">{billNum}</span>
        </div>
        {isPhone && etaText && (
          <div className="tv-phone-order-eta">
            <PhoneCall className="w-3.5 h-3.5 mr-1 inline flex-shrink-0" />
            <span>PHONE • {etaText}</span>
          </div>
        )}
      </div>

      {/* 2. Right: Prominent Status Badge */}
      <div className="tv-row-status">
        <div className={`tv-status-pill ${statusBadgeClass}`}>
          <StatusIcon className="w-5 h-5 mr-2 inline flex-shrink-0" />
          <span>{statusLabel}</span>
        </div>
      </div>
    </div>
  );
});

/**
 * Unified Table Panel displaying columns: BILL NO. | STATUS
 * Exactly 8 rows per panel
 */
const CustomerUnifiedTablePanel = React.memo(function CustomerUnifiedTablePanel({
  orders,
  newlyArrivedIds,
  panelIndex = 0,
}) {
  return (
    <div className="tv-unified-panel">
      {/* Table Column Header */}
      <div className="tv-table-col-header">
        <span className="tv-col-label-bill">BILL NO.</span>
        <span className="tv-col-label-status">STATUS</span>
      </div>

      {/* Table Rows (Fixed 8 rows) */}
      <div className="tv-table-rows">
        {orders.map((order, idx) => {
          const idStr = (order.order_id || order.id).toString();
          return (
            <CustomerDisplayRow
              key={idStr}
              order={order}
              isNewlyArrived={newlyArrivedIds.has(idStr)}
              queueIndex={panelIndex * 8 + idx}
              isEven={idx % 2 === 1}
            />
          );
        })}
      </div>
    </div>
  );
});

export default function CustomerDisplay({ hotelId: initialHotelId }) {
  const [selectedHotelId, setSelectedHotelId] = useState(() => {
    return initialHotelId ? Number(initialHotelId) : null;
  });
  const [hotelInfo, setHotelInfo] = useState(null);
  const [availableHotels, setAvailableHotels] = useState([]);
  const [loadingHotels, setLoadingHotels] = useState(false);

  const [orders, setOrders] = useState([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState('LIVE'); // 'LIVE' | 'RECONNECTING' | 'LOST'
  const [newlyArrivedIds, setNewlyArrivedIds] = useState(new Set());
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [qrImgError, setQrImgError] = useState(false);

  const isPollingRef = useRef(false);
  const pollTimerRef = useRef(null);
  const consecutiveErrorsRef = useRef(0);
  const knownOrderIdsRef = useRef(null);

  const { isFullscreen, toggleFullscreen } = useFullscreen();
  const { requestWakeLock } = useWakeLock();

  // Keep digital clock ticking every 1 second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Request wake lock on mount
  useEffect(() => {
    requestWakeLock();
  }, [requestWakeLock]);

  // Load hotel list if hotelId was not provided in URL
  useEffect(() => {
    if (selectedHotelId) return;

    setLoadingHotels(true);
    getPublicHotels()
      .then((list) => {
        setAvailableHotels(list);
        if (list.length === 1) {
          setSelectedHotelId(list[0].id);
          setHotelInfo(list[0]);
        }
      })
      .catch((err) => {
        console.warn('Could not load public hotels for customer display:', err);
      })
      .finally(() => {
        setLoadingHotels(false);
      });
  }, [selectedHotelId]);

  // Establish isolated session when hotel is selected
  useEffect(() => {
    if (!selectedHotelId) return;

    let isCancelled = false;

    const establishSession = async () => {
      try {
        const authData = await connectCustomerDisplay(selectedHotelId);
        if (!isCancelled && authData?.user?.restaurant_name) {
          setHotelInfo((prev) => ({
            ...prev,
            id: selectedHotelId,
            name: authData.user.restaurant_name,
          }));
        }
      } catch (err) {
        console.warn('Silent customer session establishment notice:', err);
      }
    };

    establishSession();
    return () => {
      isCancelled = true;
    };
  }, [selectedHotelId]);

  // Core order fetch loop with tab session isolation & instant sync
  const fetchOrders = useCallback(async () => {
    if (!selectedHotelId) return;

    try {
      const rawOrders = await fetchLiveOrdersForDisplay(selectedHotelId);
      const filtered = filterCustomerOrders(rawOrders, selectedHotelId, hotelInfo);

      // Track newly arrived orders for subtle glow transition
      const incomingIds = new Set(filtered.map((o) => (o.order_id || o.id).toString()));
      if (knownOrderIdsRef.current !== null) {
        const fresh = new Set();
        incomingIds.forEach((id) => {
          if (!knownOrderIdsRef.current.has(id)) {
            fresh.add(id);
          }
        });
        if (fresh.size > 0) {
          setNewlyArrivedIds(fresh);
          setTimeout(() => {
            setNewlyArrivedIds(new Set());
          }, 6000);
        }
      }
      knownOrderIdsRef.current = incomingIds;

      setOrders(filtered);
      setConnectionStatus('LIVE');
      consecutiveErrorsRef.current = 0;
      setInitialLoading(false);
    } catch (err) {
      console.warn('Customer display polling error:', err);
      consecutiveErrorsRef.current += 1;
      if (consecutiveErrorsRef.current >= 4) {
        setConnectionStatus('LOST');
      } else if (consecutiveErrorsRef.current >= 2) {
        setConnectionStatus('RECONNECTING');
      }
    } finally {
      setInitialLoading(false);
    }
  }, [selectedHotelId]);

  // High-frequency polling (every 1 second)
  useEffect(() => {
    if (!selectedHotelId) return;

    let isMounted = true;

    const runPoll = async () => {
      if (!isMounted) return;
      isPollingRef.current = true;
      await fetchOrders();
      isPollingRef.current = false;
      if (isMounted) {
        pollTimerRef.current = setTimeout(runPoll, 1000);
      }
    };

    runPoll();

    // Instant sync via BroadcastChannel
    let channel = null;
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        channel = new BroadcastChannel('udipi_kds_sync_channel');
        channel.onmessage = () => {
          if (!isPollingRef.current) {
            fetchOrders();
          }
        };
      } catch {
        // BroadcastChannel unavailable
      }
    }

    // Storage sync for cross-window events
    const handleStorageSync = (e) => {
      if (e.key === 'kds_instant_sync_ping' && !isPollingRef.current) {
        fetchOrders();
      }
    };
    window.addEventListener('storage', handleStorageSync);

    const handleFocus = () => {
      if (!isPollingRef.current) {
        runPoll();
      }
    };
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleFocus);

    return () => {
      isMounted = false;
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
      if (channel) channel.close();
      window.removeEventListener('storage', handleStorageSync);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleFocus);
    };
  }, [selectedHotelId, fetchOrders]);

  // Group orders into BILLED, PREPARING, and READY
  const { billedOrders, preparingOrders, readyOrders } = useMemo(() => {
    const billed = [];
    const preparing = [];
    const ready = [];

    orders.forEach((o) => {
      const s = (o.status || '').toUpperCase();
      if (s === 'READY') {
        ready.push(o);
      } else if (s === 'PREPARING') {
        preparing.push(o);
      } else if (s === 'PENDING' || s === 'CONFIRMED') {
        billed.push(o);
      }
    });

    // Sort by Bill Number ascending for easy customer lookup
    const sortByBill = (a, b) => {
      const bA = Number(a.bill_no) || 0;
      const bB = Number(b.bill_no) || 0;
      if (bA !== bB) return bA - bB;
      const tA = new Date(a.created_at || 0).getTime();
      const tB = new Date(b.created_at || 0).getTime();
      return tA - tB;
    };

    billed.sort(sortByBill);
    preparing.sort(sortByBill);
    ready.sort(sortByBill);

    return {
      billedOrders: billed,
      preparingOrders: preparing,
      readyOrders: ready,
    };
  }, [orders]);

  // Combine all active orders into a single unified list
  // Priority: READY first (green), then PREPARING (orange), then BILLED (blue)
  // Within each status, orders are sorted numerically by bill number
  const allSortedOrders = useMemo(() => {
    return [...readyOrders, ...preparingOrders, ...billedOrders];
  }, [readyOrders, preparingOrders, billedOrders]);

  // Always exactly 3 columns with up to 8 rows in each column (total 24 orders visible at once)
  // If total active orders > 24, smoothly advance the batch every 10 seconds
  const [pageOffset, setPageOffset] = useState(0);

  useEffect(() => {
    if (allSortedOrders.length <= 24) {
      if (pageOffset !== 0) setPageOffset(0);
      return;
    }

    const interval = setInterval(() => {
      setPageOffset((prev) => {
        const next = prev + 24;
        return next >= allSortedOrders.length ? 0 : next;
      });
    }, 10000);

    return () => clearInterval(interval);
  }, [allSortedOrders.length, pageOffset]);

  const { col1Orders, col2Orders, col3Orders } = useMemo(() => {
    const currentBatch = allSortedOrders.slice(pageOffset, pageOffset + 24);
    return {
      col1Orders: currentBatch.slice(0, 8),
      col2Orders: currentBatch.slice(8, 16),
      col3Orders: currentBatch.slice(16, 24),
    };
  }, [allSortedOrders, pageOffset]);

  // Formatted date and time strings
  const timeFormatted = useMemo(() => {
    return currentTime
      .toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      })
      .toLowerCase();
  }, [currentTime]);

  const dateFormatted = useMemo(() => {
    const weekday = currentTime.toLocaleDateString('en-US', { weekday: 'short' });
    const day = currentTime.getDate();
    const month = currentTime.toLocaleDateString('en-US', { month: 'short' });
    const year = currentTime.getFullYear();
    return `${weekday}, ${day} ${month}, ${year}`;
  }, [currentTime]);

  // Handle branch selection when opened without ?hotel= parameter
  const handleSelectBranch = async (hotel) => {
    setSelectedHotelId(hotel.id);
    setHotelInfo(hotel);
    try {
      await connectCustomerDisplay(hotel.id, hotel.name);
    } catch (err) {
      console.warn('Initial branch connect notice:', err);
    }
    const newUrl = `${window.location.origin}${window.location.pathname}?display=customer&hotel=${hotel.id}`;
    window.history.replaceState({ path: newUrl }, '', newUrl);
  };

  // Branch picker screen if no hotel ID is selected
  if (!selectedHotelId) {
    return (
      <div className="tv-branch-picker-screen">
        <div className="tv-branch-picker-shell">
          <div className="tv-picker-header">
            <img
              src="/dataudipi-header-logo.png"
              alt="Data Udipi"
              className="tv-picker-logo-img"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
            <h1 className="tv-picker-title">Customer Kitchen Display</h1>
            <p className="tv-picker-subtitle">
              Select your hotel branch to launch the live order status board
            </p>
          </div>

          {loadingHotels ? (
            <div className="tv-loading-spinner" />
          ) : (
            <div className="tv-branch-grid">
              {availableHotels.map((hotel) => (
                <div
                  key={hotel.id}
                  className="tv-branch-card"
                  onClick={() => handleSelectBranch(hotel)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Building2 className="w-6 h-6 text-amber-500" />
                    <h3 className="tv-branch-card-name">{hotel.name}</h3>
                  </div>
                  {hotel.address && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <MapPin className="w-4 h-4 text-neutral-400" />
                      <p className="tv-branch-card-address">{hotel.address}</p>
                    </div>
                  )}
                  <div className="tv-branch-card-btn">
                    <span>Launch Display</span>
                    <ArrowRight className="w-4 h-4" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Initial loading state
  if (initialLoading && orders.length === 0) {
    return (
      <div className="tv-loading-screen">
        <div className="tv-loading-spinner" />
        <p className="tv-loading-text">
          Connecting to {hotelInfo?.name || `Hotel #${selectedHotelId}`} Order Board...
        </p>
      </div>
    );
  }

  // Format hotel branch display name (e.g. Data Udipi — MGR Nagar)
  const hotelDisplayName = hotelInfo?.name
    ? hotelInfo.name.startsWith('Data Udipi')
      ? hotelInfo.name
      : `Data Udipi — ${hotelInfo.name}`
    : `Data Udipi — Branch #${selectedHotelId}`;

  return (
    <div className="customer-tv-screen">
      {/* ── 1. COMPACT TOP TV HEADER ── */}
      <header className="customer-tv-header">
        {/* Brand, Logo & Branch Subtitle */}
        <div className="tv-header-left">
          <div className="tv-brand-info">
            <img
              src="/dataudipi-brand-logo.png"
              alt="Data Udipi"
              className="tv-brand-logo-img"
              onError={(e) => {
                e.currentTarget.src = '/dataudipi-header-logo.png';
              }}
            />
            <span className="tv-hotel-subtitle">{hotelDisplayName}</span>
          </div>

          <div className="tv-header-vdivider" />

          {/* Cashier Takeaway Indicator Pill */}
          <div className="tv-takeaway-tag">
            <ShoppingBag className="w-3.5 h-3.5 tv-takeaway-icon" />
            <span>TAKEAWAY BILLS</span>
          </div>
        </div>

        {/* Status Counts & Legend in Center */}
        <div className="tv-header-center">
          <div className="tv-legend-pill">
            <div className="tv-legend-item billed">
              <span className="tv-legend-dot billed" />
              <span>BILLED:</span>
              <span className="tv-legend-count billed">{billedOrders.length}</span>
            </div>
            <div className="tv-legend-item preparing">
              <span className="tv-legend-dot preparing" />
              <span>PREPARING:</span>
              <span className="tv-legend-count preparing">{preparingOrders.length}</span>
            </div>
            <div className="tv-legend-item ready">
              <span className="tv-legend-dot ready" />
              <span>READY FOR PICKUP:</span>
              <span className="tv-legend-count ready">{readyOrders.length}</span>
            </div>
            <div className="tv-legend-divider" />
            <div className="tv-legend-item total">
              <span>TOTAL:</span>
              <span className="tv-legend-count total">{orders.length}</span>
            </div>
          </div>
        </div>

        {/* Live Status, Clock & Fullscreen */}
        <div className="tv-header-right">
          {/* Connection status pill */}
          <div className={`tv-connection-badge ${connectionStatus.toLowerCase()}`}>
            {connectionStatus === 'LIVE' && (
              <>
                <span className="tv-live-dot" />
                <span>LIVE</span>
              </>
            )}
            {connectionStatus === 'RECONNECTING' && (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>RECONNECTING</span>
              </>
            )}
            {connectionStatus === 'LOST' && (
              <>
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>CONNECTION LOST</span>
              </>
            )}
          </div>

          <div className="tv-header-vdivider" />

          {/* Digital Clock & Date */}
          <div className="tv-clock-box">
            <span className="tv-live-time">{timeFormatted}</span>
            <span className="tv-live-date">{dateFormatted}</span>
          </div>

          {/* Fullscreen Button */}
          <button
            type="button"
            onClick={toggleFullscreen}
            className="tv-fullscreen-btn"
            title={isFullscreen ? 'Exit Fullscreen' : 'Enter TV Fullscreen'}
          >
            {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* ── 2. MAIN 3-COLUMN UNIFIED BOARD (8 ROWS IN EACH COLUMN) ── */}
      <main className="customer-tv-main">
        {allSortedOrders.length === 0 ? (
          <div className="tv-section-empty">
            <ShoppingBag className="w-12 h-12 text-neutral-300 mb-2 opacity-50" />
            <span>No active takeaway orders right now</span>
          </div>
        ) : (
          <div className="tv-unified-panels-grid">
            <CustomerUnifiedTablePanel
              orders={col1Orders}
              newlyArrivedIds={newlyArrivedIds}
              panelIndex={0}
            />
            <CustomerUnifiedTablePanel
              orders={col2Orders}
              newlyArrivedIds={newlyArrivedIds}
              panelIndex={1}
            />
            <CustomerUnifiedTablePanel
              orders={col3Orders}
              newlyArrivedIds={newlyArrivedIds}
              panelIndex={2}
            />
          </div>
        )}
      </main>

      {/* ── 3. COMPACT BOTTOM PROMOTIONAL BANNER – DATA UDIPI APP ── */}
      <footer className="tv-promo-banner">
        {/* Left: Genuine Data Udipi QR Code Image */}
        <div className="tv-promo-qr-side">
          <div className="tv-promo-qr-frame">
            {!qrImgError ? (
              <img
                src="/dataudipi-app-qr.png"
                alt="Scan to Download Data Udipi App"
                className="tv-promo-qr-img"
                onError={() => setQrImgError(true)}
              />
            ) : (
              <QrCode className="w-10 h-10 text-emerald-600" />
            )}
          </div>
        </div>

        {/* Green vertical accent line matching reference image */}
        <div className="tv-promo-vdivider" />

        {/* Center: Promotional Copy */}
        <div className="tv-promo-text-side">
          <h2 className="tv-promo-heading">ORDER FROM YOUR HOME!</h2>
          <p className="tv-promo-subheading">
            You can place your order from your home using the Data Udipi App.
          </p>
        </div>

        {/* Right: Green CTA Pill Button (Contained inside banner) */}
        <div className="tv-promo-cta-side">
          <div className="tv-promo-cta-bar">
            <Download className="w-3.5 h-3.5 text-white flex-shrink-0" />
            <span className="tv-promo-cta-text">
              SCAN THE QR CODE TO DOWNLOAD THE APP
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
