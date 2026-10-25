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
  Utensils
} from 'lucide-react';
import { orderService } from '../services/api';
import { ringKOTOrders } from '../utils/kotAudio';

export default function KDSOrdersView({
  orderMode,
  searchTerm,
  onActiveCountChange,
  isAudioUnlocked
}) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastSyncTime, setLastSyncTime] = useState(null);
  const [selectedKOTOrder, setSelectedKOTOrder] = useState(null);
  const [newlyArrivedIds, setNewlyArrivedIds] = useState(new Set());

  const knownOrderIdsRef = useRef(null);
  const pendingUpdatesRef = useRef(new Map());

  const isDelivery = (order) => {
    return order.order_type?.toLowerCase() === 'delivery';
  };

  const isTakeaway = (order) => {
    return (
      !isDelivery(order) &&
      (!order.table_number ||
        order.table_number === 'N/A' ||
        order.table_number.toString().toLowerCase() === 'takeaway')
    );
  };

  const isDineIn = (order) => {
    return !isDelivery(order) && !isTakeaway(order);
  };

  const formatOrderTime = (dateString) => {
    if (!dateString) return '';
    let dStr = typeof dateString === 'string' ? dateString : dateString.toString();
    if (!dStr.includes('Z') && !dStr.includes('+')) {
      dStr = dStr.replace(' ', 'T') + 'Z';
    }
    const d = new Date(dStr);
    const validDate = isNaN(d.getTime()) ? new Date(dateString) : d;
    if (isNaN(validDate.getTime())) return '';
    return validDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
  };

  const timeAgoMinutes = (dateString) => {
    if (!dateString) return 0;
    let dStr = typeof dateString === 'string' ? dateString : dateString.toString();
    if (!dStr.includes('Z') && !dStr.includes('+')) {
      dStr = dStr.replace(' ', 'T') + 'Z';
    }
    const diffMs = new Date() - new Date(dStr);
    return Math.max(0, Math.floor(diffMs / 60000));
  };

  const timeAgoDisplay = (minutes) => {
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hrs = Math.floor(minutes / 60);
    return `${hrs}h ${minutes % 60}m ago`;
  };

  const getCustomerDetails = (order) => {
    let name = (order?.customer_name || '').trim();
    let phone = (order?.customer_phone || '').trim();

    let deliveryObj = null;
    if (order?.delivery_address) {
      if (typeof order.delivery_address === 'string') {
        try {
          deliveryObj = JSON.parse(order.delivery_address);
        } catch (e) {
          deliveryObj = null;
        }
      } else if (typeof order.delivery_address === 'object') {
        deliveryObj = order.delivery_address;
      }
    }

    if (deliveryObj) {
      if (!name || name === 'Guest' || name === phone) {
        const addrName = deliveryObj.contact_name || deliveryObj.name;
        if (addrName) name = addrName.trim();
      }
      if (!phone) {
        const addrPhone = deliveryObj.contact_phone || deliveryObj.phone;
        if (addrPhone) phone = addrPhone.trim();
      }
    }

    if (!name || name === 'None') {
      if (phone) {
        name = 'Customer';
      } else if (order?.table_number && !isTakeaway(order) && !isDelivery(order)) {
        name = `Table ${order.table_number}`;
      } else {
        name = isTakeaway(order) ? 'Takeaway Guest' : isDelivery(order) ? 'Delivery Guest' : 'Guest';
      }
    }

    return { name, phone };
  };

  const getPaymentBadge = (order) => {
    const method = (order?.payment_method || '').toLowerCase().trim();
    const status = (order?.payment_status || '').toLowerCase().trim();
    const isPaid = status === 'paid';

    const isPayAtCounter =
      method.includes('cash') ||
      method.includes('counter') ||
      method.includes('cod') ||
      method.includes('pay at counter');

    const isUpi =
      method.includes('upi') ||
      method.includes('razorpay') ||
      method.includes('online') ||
      method.includes('gpay') ||
      method.includes('phonepe');

    if (isPaid) {
      return {
        isPaid: true,
        text: isUpi ? 'UPI Paid' : isPayAtCounter ? 'Counter Paid' : 'Paid',
        className: 'badge-paid'
      };
    }

    return {
      isPaid: false,
      text: isPayAtCounter ? 'Pay at Counter' : 'Payment Pending',
      className: 'badge-unpaid'
    };
  };

  // Fetch Live Orders
  const fetchOrders = useCallback(async () => {
    try {
      const data = await orderService.getLiveOrders();
      let currentOrders = Array.isArray(data) ? data : [];

      // Preserve optimistic updates
      if (pendingUpdatesRef.current.size > 0) {
        currentOrders = currentOrders.map((o) => {
          const pending = pendingUpdatesRef.current.get(o.order_id);
          return pending ? { ...o, status: pending } : o;
        });
      }

      if (currentOrders.length > 0) {
        const currentIds = currentOrders.map((o) => o.order_id || o.id);

        if (knownOrderIdsRef.current === null) {
          // Initial load
          knownOrderIdsRef.current = new Set(currentIds);
        } else {
          // Check for new arrivals
          const newOrders = currentOrders.filter(
            (o) => !knownOrderIdsRef.current.has(o.order_id || o.id)
          );
          const newOrdersCount = newOrders.length;

          if (newOrdersCount > 0) {
            const newlyAddedSet = new Set(newOrders.map((o) => o.order_id || o.id));
            setNewlyArrivedIds(newlyAddedSet);

            newOrders.forEach((o) => knownOrderIdsRef.current.add(o.order_id || o.id));

            // Ring alarm loudly
            ringKOTOrders(newOrdersCount);

            // Remove visual highlight after 12 seconds
            setTimeout(() => {
              setNewlyArrivedIds(new Set());
            }, 12000);
          }
        }
      } else if (knownOrderIdsRef.current === null) {
        knownOrderIdsRef.current = new Set();
      }

      setOrders(currentOrders);
      setLastSyncTime(new Date());
      setError(null);
    } catch (err) {
      console.error('Error fetching live orders:', err);
      setError('Connection interrupted. Retrying live feed...');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
    const interval = setInterval(fetchOrders, 4000); // 4-second polling for immediate kitchen alerts
    return () => clearInterval(interval);
  }, [fetchOrders]);

  // Update order status with 0ms optimistic UI update
  const updateOrderStatus = useCallback((orderId, newStatus) => {
    if (!orderId) return;

    pendingUpdatesRef.current.set(orderId, newStatus);

    // 0ms instant UI reaction
    setOrders((current) =>
      current.map((o) => (o.order_id === orderId ? { ...o, status: newStatus } : o))
    );

    orderService
      .updateOrderStatus(orderId, newStatus)
      .then(() => {
        setTimeout(() => {
          pendingUpdatesRef.current.delete(orderId);
        }, 5000);
      })
      .catch((err) => {
        console.error('Error updating order status:', err);
        pendingUpdatesRef.current.delete(orderId);
        fetchOrders();
      });
  }, [fetchOrders]);

  // Filter orders according to active mode & search term
  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      if (orderMode === 'DINE_IN' && !isDineIn(order)) return false;
      if (orderMode === 'TAKEAWAY' && !isTakeaway(order)) return false;
      if (orderMode === 'DELIVERY' && !isDelivery(order)) return false;

      if (!searchTerm.trim()) return true;
      const term = searchTerm.toLowerCase().trim();
      const orderIdStr = (order.order_id || '').toString().toLowerCase();
      const branchOrderIdStr = (order.branch_order_id || '').toString().toLowerCase();
      const billNoStr = (order.bill_no || '').toString().toLowerCase();
      const tableStr = (order.table_number || '').toString().toLowerCase();
      const cust = getCustomerDetails(order);

      return (
        orderIdStr.includes(term) ||
        branchOrderIdStr.includes(term) ||
        billNoStr.includes(term) ||
        tableStr.includes(term) ||
        cust.name.toLowerCase().includes(term) ||
        cust.phone.includes(term)
      );
    });
  }, [orders, orderMode, searchTerm]);

  // Categorize into NEW (Pending/Confirmed/Preparing) vs HISTORY (Ready/Served)
  const newOrdersList = useMemo(() => {
    return filteredOrders.filter((o) => {
      const s = (o.status || '').toUpperCase();
      return s === 'PENDING' || s === 'CONFIRMED' || s === 'PREPARING';
    });
  }, [filteredOrders]);

  const historyOrdersList = useMemo(() => {
    return filteredOrders.filter((o) => {
      const s = (o.status || '').toUpperCase();
      return s === 'READY' || s === 'SERVED';
    });
  }, [filteredOrders]);

  // Report active count to parent header
  useEffect(() => {
    if (onActiveCountChange) {
      onActiveCountChange(newOrdersList.length);
    }
  }, [newOrdersList.length, onActiveCountChange]);

  return (
    <div className="kds-view-container">
      {/* Live Sync Status Bar */}
      {error && (
        <div className="kds-alert-bar">
          <AlertTriangle className="w-5 h-5 animate-pulse text-amber-300" />
          <span>{error}</span>
          <button onClick={fetchOrders} className="kds-alert-retry-btn">
            <RefreshCw className="w-4 h-4 mr-1" /> Retry Now
          </button>
        </div>
      )}

      {/* Main 2-Column Split View */}
      <div className="kds-columns-grid">
        {/* COLUMN 1: NEW & IN-PREPARATION */}
        <section className="kds-column column-new">
          <div className="column-header new-orders-header">
            <div className="column-header-title">
              <Clock className="w-6 h-6 text-amber-400" />
              <h2>New & Preparing</h2>
            </div>
            <span className="column-count-badge count-new">
              {newOrdersList.length}
            </span>
          </div>

          <div className="column-orders-list">
            {loading && newOrdersList.length === 0 ? (
              <div className="kds-empty-state">
                <RefreshCw className="w-8 h-8 text-neutral-500 animate-spin mb-2" />
                <p>Loading live kitchen orders...</p>
              </div>
            ) : newOrdersList.length === 0 ? (
              <div className="kds-empty-state">
                <ChefHat className="w-12 h-12 text-neutral-600 mb-2" />
                <p className="empty-title">All Caught Up!</p>
                <p className="empty-sub">No pending kitchen orders right now.</p>
              </div>
            ) : (
              newOrdersList.map((order) => {
                const orderId = order.order_id || order.id;
                const status = (order.status || '').toUpperCase();
                const isNewlyArrived = newlyArrivedIds.has(orderId);
                const mins = timeAgoMinutes(order.created_at);
                const cust = getCustomerDetails(order);
                const payBadge = getPaymentBadge(order);

                // Delay indicator class
                const delayClass = mins >= 20 ? 'delay-urgent' : mins >= 10 ? 'delay-warning' : 'delay-normal';

                return (
                  <div
                    key={orderId}
                    className={`kds-card card-new ${isNewlyArrived ? 'card-newly-arrived' : ''} ${delayClass}`}
                  >
                    {/* Card Header */}
                    <div className="card-top-bar">
                      <div className="card-title-group">
                        <span className="card-table-badge">
                          {isDineIn(order) ? (
                            `TABLE ${order.table_number || '?'}`
                          ) : isTakeaway(order) ? (
                            'TAKEAWAY'
                          ) : (
                            'DELIVERY'
                          )}
                        </span>
                        {order.bill_no && (
                          <span className="card-bill-badge">Bill #{order.bill_no}</span>
                        )}
                        <span className="card-id-text">#{order.branch_order_id || orderId}</span>
                      </div>

                      <div className="card-timer-badge">
                        <Clock className="w-3.5 h-3.5 inline mr-1" />
                        <span>{timeAgoDisplay(mins)}</span>
                      </div>
                    </div>

                    {/* Customer & Placed By Row */}
                    <div className="card-meta-row">
                      <div className="card-customer-info">
                        <User className="w-3.5 h-3.5 inline mr-1 text-neutral-400" />
                        <span>{cust.name}</span>
                        {cust.phone && <span className="text-neutral-400 ml-1">({cust.phone})</span>}
                      </div>

                      <span className={`payment-pill ${payBadge.className}`}>
                        {payBadge.text}
                      </span>
                    </div>

                    {/* Order Items Table */}
                    <div className="card-items-box">
                      {(order.items || []).map((item, idx) => (
                        <div key={idx} className="card-item-row">
                          <span className="item-qty-badge">{item.quantity}x</span>
                          <span className="item-name">{item.name}</span>
                          <span className="item-price">₹{(item.price * item.quantity).toFixed(0)}</span>
                        </div>
                      ))}
                    </div>

                    {/* Placed Info & Footer */}
                    <div className="card-footer-info">
                      <span className="placed-time">Placed: {formatOrderTime(order.created_at)}</span>
                      {order.placed_by_name && (
                        <span className="placed-by">By: {order.placed_by_name}</span>
                      )}
                    </div>

                    {/* Action Buttons */}
                    <div className="card-action-bar">
                      <button
                        onClick={() => setSelectedKOTOrder(order)}
                        className="btn-card-secondary"
                        title="View / Print KOT Ticket"
                      >
                        <Printer className="w-4 h-4 mr-1" /> KOT
                      </button>

                      {status !== 'PREPARING' ? (
                        <button
                          onClick={() => updateOrderStatus(orderId, 'PREPARING')}
                          className="btn-card-prep"
                        >
                          <Utensils className="w-4 h-4 mr-1.5" /> Start Prep
                        </button>
                      ) : (
                        <button
                          onClick={() => updateOrderStatus(orderId, 'READY')}
                          className="btn-card-ready"
                        >
                          <CheckCircle2 className="w-5 h-5 mr-1.5" /> Mark Ready
                        </button>
                      )}

                      {status === 'PREPARING' && (
                        <button
                          onClick={() => updateOrderStatus(orderId, 'CONFIRMED')}
                          className="btn-card-undo"
                          title="Undo to Pending"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* COLUMN 2: READY & HISTORY */}
        <section className="kds-column column-history">
          <div className="column-header history-header">
            <div className="column-header-title">
              <CheckCircle2 className="w-6 h-6 text-emerald-400" />
              <h2>Ready & Served</h2>
            </div>
            <span className="column-count-badge count-history">
              {historyOrdersList.length}
            </span>
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
                const orderId = order.order_id || order.id;
                const status = (order.status || '').toUpperCase();
                const mins = timeAgoMinutes(order.created_at);
                const cust = getCustomerDetails(order);
                const isReady = status === 'READY';

                return (
                  <div
                    key={orderId}
                    className={`kds-card card-history ${isReady ? 'ready-pulse' : 'card-served'}`}
                  >
                    <div className="card-top-bar">
                      <div className="card-title-group">
                        <span className="card-table-badge history-table">
                          {isDineIn(order) ? (
                            `TABLE ${order.table_number || '?'}`
                          ) : isTakeaway(order) ? (
                            'TAKEAWAY'
                          ) : (
                            'DELIVERY'
                          )}
                        </span>
                        {order.bill_no && (
                          <span className="card-bill-badge">Bill #{order.bill_no}</span>
                        )}
                        <span className="card-id-text">#{order.branch_order_id || orderId}</span>
                      </div>

                      <span className={`status-pill ${isReady ? 'pill-ready' : 'pill-served'}`}>
                        {isReady ? 'READY TO SERVE' : 'SERVED'}
                      </span>
                    </div>

                    <div className="card-meta-row">
                      <div className="card-customer-info">
                        <User className="w-3.5 h-3.5 inline mr-1 text-neutral-400" />
                        <span>{cust.name}</span>
                      </div>
                      <span className="ready-time">{formatOrderTime(order.created_at)}</span>
                    </div>

                    <div className="card-items-box history-items">
                      {(order.items || []).map((item, idx) => (
                        <div key={idx} className="card-item-row">
                          <span className="item-qty-badge history-qty">{item.quantity}x</span>
                          <span className="item-name">{item.name}</span>
                        </div>
                      ))}
                    </div>

                    {/* Action Bar */}
                    <div className="card-action-bar">
                      <button
                        onClick={() => setSelectedKOTOrder(order)}
                        className="btn-card-secondary"
                        title="View / Print KOT Ticket"
                      >
                        <Printer className="w-4 h-4 mr-1" /> KOT
                      </button>

                      {isReady ? (
                        <button
                          onClick={() => updateOrderStatus(orderId, 'SERVED')}
                          className="btn-card-serve"
                        >
                          <CheckCircle2 className="w-4 h-4 mr-1.5" /> Mark Served
                        </button>
                      ) : (
                        <span className="served-complete-tag">
                          ✓ Order Complete
                        </span>
                      )}

                      <button
                        onClick={() => updateOrderStatus(orderId, 'PREPARING')}
                        className="btn-card-undo"
                        title="Reopen back to Kitchen"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>

      {/* KOT Ticket Modal */}
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
                <strong>Order #:</strong> #{selectedKOTOrder.branch_order_id || selectedKOTOrder.order_id}
              </div>
              <div>
                <strong>Bill #:</strong> {selectedKOTOrder.bill_no || 'N/A'}
              </div>
              <div>
                <strong>Type:</strong> {selectedKOTOrder.order_type || 'Dine-In'}
              </div>
              <div>
                <strong>Table:</strong> {selectedKOTOrder.table_number || 'N/A'}
              </div>
              <div>
                <strong>Time:</strong> {formatOrderTime(selectedKOTOrder.created_at)}
              </div>
              <div>
                <strong>Staff:</strong> {selectedKOTOrder.placed_by_name || 'Counter'}
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
              <button
                onClick={() => window.print()}
                className="btn-kot-print"
              >
                <Printer className="w-4 h-4 mr-2" /> Print Ticket
              </button>
              <button
                onClick={() => setSelectedKOTOrder(null)}
                className="btn-kot-close"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
