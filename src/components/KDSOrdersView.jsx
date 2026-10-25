import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Clock,
  CheckCircle2,
  ChefHat,
  Search,
  Bell,
  Printer,
  AlertTriangle,
  User,
  Phone,
  ArrowRight,
  RotateCcw,
  RefreshCw,
  Utensils,
  ArrowDownUp,
  SlidersHorizontal,
  Flame,
  Check
} from 'lucide-react';
import { orderService } from '../services/api';
import { ringKOTOrders } from '../utils/kotAudio';

// Helper to normalize order id to string
const getNormalizedId = (order) => (order?.order_id ?? order?.id)?.toString();

// Memoized Individual Ticket Card for 0ms render latency
const KDSTicketCard = React.memo(function KDSTicketCard({
  order,
  isNewlyArrived,
  isHistory,
  onUpdateStatus,
  onOpenKOT
}) {
  const orderId = order.order_id || order.id;
  const status = (order.status || '').toUpperCase();
  const isReady = status === 'READY';

  const isDelivery = order.order_type?.toLowerCase() === 'delivery';
  const isTakeaway = !isDelivery && (!order.table_number || order.table_number === 'N/A' || order.table_number.toString().toLowerCase() === 'takeaway');
  const isDineIn = !isDelivery && !isTakeaway;

  // Calculate elapsed time
  let mins = 0;
  if (order.created_at) {
    let dStr = typeof order.created_at === 'string' ? order.created_at : order.created_at.toString();
    if (!dStr.includes('Z') && !dStr.includes('+')) {
      dStr = dStr.replace(' ', 'T') + 'Z';
    }
    const diffMs = new Date() - new Date(dStr);
    mins = Math.max(0, Math.floor(diffMs / 60000));
  }

  const timeAgoDisplay = (m) => {
    if (m < 1) return 'Just now';
    if (m < 60) return `${m}m ago`;
    const hrs = Math.floor(m / 60);
    return `${hrs}h ${m % 60}m ago`;
  };

  const formatOrderTime = (dateString) => {
    if (!dateString) return '';
    let dStr = typeof dateString === 'string' ? dateString : dateString.toString();
    if (!dStr.includes('Z') && !dStr.includes('+')) {
      dStr = dStr.replace(' ', 'T') + 'Z';
    }
    const d = new Date(dStr);
    return isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
  };

  // Payment badge
  const method = (order?.payment_method || '').toLowerCase().trim();
  const pStatus = (order?.payment_status || '').toLowerCase().trim();
  const isPaid = pStatus === 'paid';
  const isPayAtCounter = method.includes('cash') || method.includes('counter') || method.includes('cod');
  const isUpi = method.includes('upi') || method.includes('razorpay') || method.includes('online');

  const payBadge = isPaid
    ? { text: isUpi ? 'UPI Paid' : isPayAtCounter ? 'Counter Paid' : 'Paid', className: 'badge-paid' }
    : { text: isPayAtCounter ? 'Pay at Counter' : 'Pending', className: 'badge-unpaid' };

  // Customer resolution
  let custName = (order?.customer_name || '').trim();
  let custPhone = (order?.customer_phone || '').trim();
  if (order?.delivery_address) {
    try {
      const addr = typeof order.delivery_address === 'string' ? JSON.parse(order.delivery_address) : order.delivery_address;
      if (addr?.contact_name || addr?.name) custName = addr.contact_name || addr.name;
      if (addr?.contact_phone || addr?.phone) custPhone = addr.contact_phone || addr.phone;
    } catch (e) {}
  }
  if (!custName || custName === 'None') {
    custName = custPhone ? 'Customer' : isDineIn ? `Table ${order.table_number}` : isTakeaway ? 'Takeaway' : 'Delivery';
  }

  // Delay urgency
  const delayClass = mins >= 20 ? 'delay-urgent' : mins >= 10 ? 'delay-warning' : 'delay-normal';
  const billNumber = order.bill_no || order.branch_order_id || orderId;

  return (
    <div
      className={`kds-card ${isHistory ? 'card-history' : 'card-new'} ${isReady ? 'ready-pulse' : ''} ${!isHistory && !isReady ? delayClass : ''} ${isNewlyArrived ? 'card-newly-arrived' : ''}`}
    >
      {/* 1. TOP METADATA ROW */}
      <div className="card-top-bar">
        <div className="card-title-group">
          <span className={`card-table-badge ${isHistory ? 'history-table' : ''}`}>
            {isDineIn ? `T-${order.table_number || '?'}` : isTakeaway ? 'TAKEAWAY' : 'DELIVERY'}
          </span>
          <span className="card-token-id">#{order.branch_order_id || orderId}</span>
        </div>

        <div className="card-timer-badge">
          <Clock className="w-3.5 h-3.5 inline mr-1 text-amber-400" />
          <span>{timeAgoDisplay(mins)}</span>
        </div>
      </div>

      {/* 2. PROMINENT CENTER BILL NUMBER (2-FEET VISIBILITY) */}
      <div className="card-bill-centerpiece">
        <div className="bill-centerpiece-header">
          <span className="bill-centerpiece-label">BILL NO</span>
          <span className={`payment-pill ${payBadge.className}`}>
            {payBadge.text}
          </span>
        </div>
        <div className="bill-centerpiece-number">
          BILL #{billNumber}
        </div>
      </div>

      {/* 3. CUSTOMER DETAILS */}
      <div className="card-meta-row">
        <div className="card-customer-info">
          <User className="w-3.5 h-3.5 inline mr-1 text-neutral-400" />
          <span className="font-semibold text-neutral-200">{custName}</span>
          {custPhone && <span className="text-neutral-400 ml-1">({custPhone})</span>}
        </div>
        <span className="placed-time">{formatOrderTime(order.created_at)}</span>
      </div>

      {/* Special notes if present */}
      {(order.special_instructions || order.notes) && (
        <div className="card-notes-box">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
          <span>{order.special_instructions || order.notes}</span>
        </div>
      )}

      {/* 4. ITEMS LIST */}
      <div className={`card-items-box ${isHistory ? 'history-items' : ''}`}>
        {(order.items || []).map((item, idx) => (
          <div key={idx} className="card-item-row">
            <span className={`item-qty-badge ${isHistory ? 'history-qty' : ''}`}>
              {item.quantity}x
            </span>
            <span className="item-name font-bold">{item.name}</span>
            <span className="item-price">₹{(item.price * item.quantity).toFixed(0)}</span>
          </div>
        ))}
      </div>

      {/* 5. FOOTER & PLACED BY */}
      <div className="card-footer-info">
        {order.placed_by_name ? (
          <span className="placed-by">By: {order.placed_by_name}</span>
        ) : (
          <span className="placed-by">POS Order</span>
        )}
      </div>

      {/* 6. INSTANT ACTION BUTTONS WITH CLEAR REVERT */}
      <div className="card-action-bar">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onOpenKOT(order);
          }}
          className="btn-card-secondary"
          title="Print KOT Ticket"
        >
          <Printer className="w-4 h-4 mr-1" /> KOT
        </button>

        {!isHistory ? (
          status !== 'PREPARING' ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onUpdateStatus(orderId, 'PREPARING');
              }}
              className="btn-card-prep"
            >
              <Utensils className="w-4 h-4 mr-1.5" /> Start Prep
            </button>
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onUpdateStatus(orderId, 'READY');
              }}
              className="btn-card-ready"
            >
              <CheckCircle2 className="w-5 h-5 mr-1.5" /> Mark Ready
            </button>
          )
        ) : (
          isReady ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onUpdateStatus(orderId, 'SERVED');
              }}
              className="btn-card-serve"
            >
              <Check className="w-4 h-4 mr-1.5" /> Mark Served
            </button>
          ) : (
            <span className="served-complete-tag">
              ✓ Order Complete
            </span>
          )
        )}

        {/* REVERT BUTTON (Staff manual revert — no automatic backtrack) */}
        {!isHistory && status === 'PREPARING' && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onUpdateStatus(orderId, 'CONFIRMED');
            }}
            className="btn-card-undo"
            title="Return ticket to Pending"
          >
            <RotateCcw className="w-4 h-4 mr-1 text-amber-400" />
            <span>Revert</span>
          </button>
        )}

        {isHistory && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onUpdateStatus(orderId, 'PREPARING');
            }}
            className="btn-card-undo"
            title="Return ticket back to Kitchen Prep"
          >
            <RotateCcw className="w-4 h-4 mr-1 text-emerald-400" />
            <span>Revert</span>
          </button>
        )}
      </div>
    </div>
  );
});

export default function KDSOrdersView({
  orderMode,
  searchTerm,
  onActiveCountChange,
  isAudioUnlocked
}) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [selectedKOTOrder, setSelectedKOTOrder] = useState(null);
  const [newlyArrivedIds, setNewlyArrivedIds] = useState(new Set());
  
  // Mobile active tab: 'NEW' (default, 100% space for cooking) vs 'READY'
  const [mobileActiveTab, setMobileActiveTab] = useState('NEW');

  // Sort order preference: 'LATEST_FIRST' (default) vs 'OLDEST_FIRST' (FIFO)
  const [sortOrder, setSortOrder] = useState(() => {
    return localStorage.getItem('kds_sort_order') || 'LATEST_FIRST';
  });

  // Time scope filter: 'TODAY' (default for speed) vs 'ALL'
  const [timeScope, setTimeScope] = useState('TODAY');

  const knownOrderIdsRef = useRef(null);
  
  // ABSOLUTE USER AUTHORITY STATUS OVERRIDES
  // Once the user clicks "Mark Ready" or "Start Prep", polling NEVER reverts the card!
  const userStatusOverridesRef = useRef(new Map());

  // Serialized polling state: strictly prevents overlapping background requests
  const isPollingRef = useRef(false);
  const pollTimerRef = useRef(null);

  const handleToggleSort = () => {
    const nextSort = sortOrder === 'LATEST_FIRST' ? 'OLDEST_FIRST' : 'LATEST_FIRST';
    setSortOrder(nextSort);
    localStorage.setItem('kds_sort_order', nextSort);
  };

  const isDelivery = (order) => order.order_type?.toLowerCase() === 'delivery';
  const isTakeaway = (order) => !isDelivery(order) && (!order.table_number || order.table_number === 'N/A' || order.table_number.toString().toLowerCase() === 'takeaway');
  const isDineIn = (order) => !isDelivery(order) && !isTakeaway(order);

  // Fetch Live Orders from server
  const fetchOrders = useCallback(async (manual = false) => {
    if (manual) setIsRefreshing(true);
    try {
      const data = await orderService.getLiveOrders();
      let rawOrders = Array.isArray(data) ? data : [];

      // Merge with user status overrides (User action has 100% priority — NO AUTO-REVERT)
      const currentOrders = rawOrders.map((o) => {
        const idStr = getNormalizedId(o);
        const userOverride = userStatusOverridesRef.current.get(idStr);

        if (userOverride) {
          if (o.status?.toUpperCase() === userOverride.toUpperCase()) {
            return o;
          }
          return { ...o, status: userOverride };
        }
        return o;
      });

      // Detect newly arrived incoming tickets for loud audio ringing
      if (currentOrders.length > 0) {
        const currentIds = currentOrders.map((o) => getNormalizedId(o));

        if (knownOrderIdsRef.current === null) {
          knownOrderIdsRef.current = new Set(currentIds);
        } else {
          const newOrders = currentOrders.filter((o) => !knownOrderIdsRef.current.has(getNormalizedId(o)));
          const newOrdersCount = newOrders.length;

          if (newOrdersCount > 0) {
            const newlyAddedSet = new Set(newOrders.map((o) => getNormalizedId(o)));
            setNewlyArrivedIds(newlyAddedSet);
            newOrders.forEach((o) => knownOrderIdsRef.current.add(getNormalizedId(o)));

            // Ring loud bell alarm immediately!
            ringKOTOrders(newOrdersCount);

            setTimeout(() => {
              setNewlyArrivedIds(new Set());
            }, 12000);
          }
        }
      } else if (knownOrderIdsRef.current === null) {
        knownOrderIdsRef.current = new Set();
      }

      setOrders(currentOrders);
      setError(null);
    } catch (err) {
      console.error('Error fetching live orders:', err);
      setError('Connection interrupted. Retrying live feed...');
    } finally {
      setLoading(false);
      if (manual) {
        setTimeout(() => setIsRefreshing(false), 500);
      }
    }
  }, []);

  // FAST SERIALIZED POLLING: RUNS EVERY 2 SECONDS FOR INSTANT LIVE ORDER REFLECTION
  useEffect(() => {
    let isMounted = true;

    const runPoll = async () => {
      if (isPollingRef.current) return;
      isPollingRef.current = true;
      try {
        await fetchOrders();
      } catch (e) {
        console.warn('Poll error:', e);
      } finally {
        isPollingRef.current = false;
        if (isMounted) {
          // Poll every 2 seconds so new orders show up within 2s of placement!
          pollTimerRef.current = setTimeout(runPoll, 2000);
        }
      }
    };

    runPoll();

    // Trigger immediate fetch when app/tab regains focus
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
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleFocus);
    };
  }, [fetchOrders]);

  // ZERO-LAG, ZERO BOUNCE-BACK STATUS UPDATER
  const updateOrderStatus = useCallback((orderId, newStatus) => {
    if (!orderId) return;

    const idStr = orderId.toString();

    // 1. Establish permanent user authority: polling will NEVER auto-revert this!
    userStatusOverridesRef.current.set(idStr, newStatus);

    // 2. Instantaneous synchronous UI update (0ms latency, single movement)
    setOrders((current) =>
      current.map((o) => (getNormalizedId(o) === idStr ? { ...o, status: newStatus } : o))
    );

    // 3. Background non-blocking network sync
    orderService
      .updateOrderStatus(orderId, newStatus)
      .catch((err) => {
        console.error('Background status sync error:', err);
        setTimeout(() => {
          orderService.updateOrderStatus(orderId, newStatus).catch(() => {});
        }, 3000);
      });
  }, []);

  // Filter and Sort Orders
  const processedOrders = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    const cutoff24h = Date.now() - 24 * 60 * 60 * 1000;

    const filtered = orders.filter((order) => {
      // Time scope filter (default TODAY focuses on active tickets)
      if (timeScope === 'TODAY') {
        const orderTime = new Date(order.created_at || 0).getTime();
        if (orderTime < cutoff24h && (order.status === 'SERVED' || order.status === 'COMPLETED')) {
          return false;
        }
      }

      // Order Mode filter (ALL includes everything: Dine-In, Takeaway, Delivery)
      if (orderMode === 'DINE_IN' && !isDineIn(order)) return false;
      if (orderMode === 'TAKEAWAY' && !isTakeaway(order)) return false;
      if (orderMode === 'DELIVERY' && !isDelivery(order)) return false;

      // Search filter
      if (!term) return true;
      const orderIdStr = (order.order_id || order.id || '').toString().toLowerCase();
      const branchOrderIdStr = (order.branch_order_id || '').toString().toLowerCase();
      const billNoStr = (order.bill_no || '').toString().toLowerCase();
      const tableStr = (order.table_number || '').toString().toLowerCase();
      const custName = (order.customer_name || '').toLowerCase();
      const custPhone = (order.customer_phone || '').toLowerCase();

      return (
        orderIdStr.includes(term) ||
        branchOrderIdStr.includes(term) ||
        billNoStr.includes(term) ||
        tableStr.includes(term) ||
        custName.includes(term) ||
        custPhone.includes(term)
      );
    });

    // ENHANCED FIFO / LILO SORTING (Latest Bill Show at First by default)
    filtered.sort((a, b) => {
      const billA = Number(a.bill_no) || Number(a.branch_order_id) || Number(a.order_id) || 0;
      const billB = Number(b.bill_no) || Number(b.branch_order_id) || Number(b.order_id) || 0;

      const timeA = new Date(a.created_at || 0).getTime();
      const timeB = new Date(b.created_at || 0).getTime();

      if (sortOrder === 'LATEST_FIRST') {
        if (billB !== billA) return billB - billA;
        return timeB - timeA;
      } else {
        if (billA !== billB) return billA - billB;
        return timeA - timeB;
      }
    });

    return filtered;
  }, [orders, orderMode, searchTerm, sortOrder, timeScope]);

  // Separate into New & In-Preparation vs Ready & Served
  const newOrdersList = useMemo(() => {
    return processedOrders.filter((o) => {
      const s = (o.status || '').toUpperCase();
      return s === 'PENDING' || s === 'CONFIRMED' || s === 'PREPARING';
    });
  }, [processedOrders]);

  const historyOrdersList = useMemo(() => {
    return processedOrders.filter((o) => {
      const s = (o.status || '').toUpperCase();
      return s === 'READY' || s === 'SERVED';
    });
  }, [processedOrders]);

  // Report active count to parent
  useEffect(() => {
    if (onActiveCountChange) {
      onActiveCountChange(newOrdersList.length);
    }
  }, [newOrdersList.length, onActiveCountChange]);

  return (
    <div className="kds-view-container">
      {/* MOBILE INTEGRATED TOOLBAR (Single sleek row for phone screens) */}
      <div className="mobile-view-toolbar mobile-only">
        <div className="mobile-column-tabs">
          <button
            onClick={() => setMobileActiveTab('NEW')}
            className={`mobile-col-tab ${mobileActiveTab === 'NEW' ? 'active new' : ''}`}
          >
            <Flame className="w-3.5 h-3.5 mr-1 text-amber-400" />
            <span>New Orders ({newOrdersList.length})</span>
          </button>

          <button
            onClick={() => setMobileActiveTab('READY')}
            className={`mobile-col-tab ${mobileActiveTab === 'READY' ? 'active ready' : ''}`}
          >
            <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-emerald-400" />
            <span>Ready ({historyOrdersList.length})</span>
          </button>
        </div>

        <div className="mobile-sub-actions">
          {/* Manual instant refresh button */}
          <button
            onClick={() => fetchOrders(true)}
            className={`mobile-sort-btn ${isRefreshing ? 'opacity-70' : ''}`}
            title="Sync Live Orders Now"
          >
            <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin text-amber-400' : ''}`} />
          </button>

          <button
            onClick={handleToggleSort}
            className={`mobile-sort-btn ${sortOrder === 'LATEST_FIRST' ? 'active-latest' : 'active-fifo'}`}
            title="Sort: Latest Bill First vs FIFO Oldest First"
          >
            <ArrowDownUp className="w-3 h-3 mr-1" />
            <span>{sortOrder === 'LATEST_FIRST' ? 'Latest' : 'FIFO'}</span>
          </button>

          <button
            onClick={() => setTimeScope(timeScope === 'TODAY' ? 'ALL' : 'TODAY')}
            className={`mobile-scope-btn ${timeScope === 'TODAY' ? 'active' : ''}`}
            title="Time filter"
          >
            <span>{timeScope === 'TODAY' ? 'Today' : 'All'}</span>
          </button>
        </div>
      </div>

      {/* DESKTOP / TABLET FLOW BAR */}
      <div className="kds-flow-controls desktop-only-flex">
        <div className="flow-controls-left">
          <button
            onClick={() => fetchOrders(true)}
            className="flow-refresh-btn"
            title="Sync Orders Now"
          >
            <RefreshCw className={`w-4 h-4 mr-1.5 ${isRefreshing ? 'animate-spin text-amber-400' : ''}`} />
            <span>{isRefreshing ? 'Syncing...' : 'Sync Live'}</span>
          </button>

          <span className="flow-label">Sort:</span>
          <button
            onClick={handleToggleSort}
            className={`flow-toggle-btn ${sortOrder === 'LATEST_FIRST' ? 'active-latest' : 'active-fifo'}`}
            title="Switch between Latest Bill First and FIFO Oldest First"
          >
            <ArrowDownUp className="w-3.5 h-3.5 mr-1.5" />
            <span>
              {sortOrder === 'LATEST_FIRST'
                ? '⚡ Latest Bill First (LILO)'
                : '⏳ Oldest Bill First (FIFO)'}
            </span>
          </button>
        </div>

        <div className="flow-controls-right">
          <div className="scope-pills">
            <button
              onClick={() => setTimeScope('TODAY')}
              className={`scope-pill ${timeScope === 'TODAY' ? 'active' : ''}`}
            >
              Active Today ({newOrdersList.length})
            </button>
            <button
              onClick={() => setTimeScope('ALL')}
              className={`scope-pill ${timeScope === 'ALL' ? 'active' : ''}`}
            >
              All Recent ({orders.length})
            </button>
          </div>
        </div>
      </div>

      {/* Responsive Board: Single full-width column on mobile, 2-column on desktop/TV */}
      <div className="kds-columns-grid">
        {/* COLUMN 1: NEW & IN-PREPARATION */}
        <section className={`kds-column column-new ${mobileActiveTab === 'NEW' ? 'mobile-visible' : 'mobile-hidden'}`}>
          <div className="column-header new-orders-header desktop-only-flex">
            <div className="column-header-title">
              <Flame className="w-5 h-5 text-amber-400 animate-pulse" />
              <h2>New Orders ({newOrdersList.length})</h2>
            </div>
            <button
              onClick={() => fetchOrders(true)}
              className="sync-inline-btn"
              title="Refresh Orders"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="column-orders-list">
            {loading && newOrdersList.length === 0 ? (
              <div className="kds-empty-state">
                <RefreshCw className="w-8 h-8 text-amber-400 animate-spin mb-2" />
                <p>Loading live kitchen orders...</p>
              </div>
            ) : newOrdersList.length === 0 ? (
              <div className="kds-empty-state">
                <ChefHat className="w-12 h-12 text-neutral-600 mb-2" />
                <p className="empty-title">All Caught Up!</p>
                <p className="empty-sub">No pending orders right now.</p>
              </div>
            ) : (
              newOrdersList.map((order) => {
                const idStr = getNormalizedId(order);
                return (
                  <KDSTicketCard
                    key={idStr}
                    order={order}
                    isNewlyArrived={newlyArrivedIds.has(idStr)}
                    isHistory={false}
                    onUpdateStatus={updateOrderStatus}
                    onOpenKOT={setSelectedKOTOrder}
                  />
                );
              })
            )}
          </div>
        </section>

        {/* COLUMN 2: READY & HISTORY */}
        <section className={`kds-column column-history ${mobileActiveTab === 'READY' ? 'mobile-visible' : 'mobile-hidden'}`}>
          <div className="column-header history-header desktop-only-flex">
            <div className="column-header-title">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              <h2>Ready & Served ({historyOrdersList.length})</h2>
            </div>
          </div>

          <div className="column-orders-list">
            {historyOrdersList.length === 0 ? (
              <div className="kds-empty-state">
                <CheckCircle2 className="w-12 h-12 text-neutral-600 mb-2" />
                <p className="empty-title">No Ready Orders</p>
                <p className="empty-sub">Completed orders will appear here.</p>
              </div>
            ) : (
              historyOrdersList.map((order) => {
                const idStr = getNormalizedId(order);
                return (
                  <KDSTicketCard
                    key={idStr}
                    order={order}
                    isNewlyArrived={false}
                    isHistory={true}
                    onUpdateStatus={updateOrderStatus}
                    onOpenKOT={setSelectedKOTOrder}
                  />
                );
              })
            )}
          </div>
        </section>
      </div>

      {/* KOT Receipt Modal */}
      {selectedKOTOrder && (
        <div className="kot-modal-backdrop" onClick={() => setSelectedKOTOrder(null)}>
          <div className="kot-modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="kot-receipt-header">
              <h3 className="kot-receipt-title">KITCHEN ORDER TICKET (KOT)</h3>
              <p className="kot-receipt-sub">Udipi Grand • Food Ordering System</p>
            </div>

            <div className="kot-divider-dashed" />

            <div className="kot-details-grid">
              <div>
                <strong>BILL #:</strong> #{selectedKOTOrder.bill_no || selectedKOTOrder.order_id}
              </div>
              <div>
                <strong>Token:</strong> #{selectedKOTOrder.branch_order_id || selectedKOTOrder.order_id}
              </div>
              <div>
                <strong>Type:</strong> {selectedKOTOrder.order_type || 'Dine-In'}
              </div>
              <div>
                <strong>Table:</strong> {selectedKOTOrder.table_number || 'N/A'}
              </div>
            </div>

            <div className="kot-divider-dashed" />

            <div className="kot-items-table">
              <div className="kot-table-head">
                <span>ITEM</span>
                <span>QTY</span>
              </div>
              {(selectedKOTOrder.items || []).map((it, idx) => (
                <div key={idx} className="kot-table-row">
                  <span className="kot-item-name">{it.name}</span>
                  <span className="kot-item-qty">{it.quantity}</span>
                </div>
              ))}
            </div>

            <div className="kot-divider-dashed" />

            <div className="kot-modal-actions">
              <button onClick={() => window.print()} className="btn-kot-print">
                <Printer className="w-4 h-4 mr-2" /> Print
              </button>
              <button onClick={() => setSelectedKOTOrder(null)} className="btn-kot-close">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
