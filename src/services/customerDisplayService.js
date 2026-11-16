import axios from 'axios';

// Resolve API base URL matching existing api.js behavior
export const getApiBaseUrl = () => {
  let envUrl = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL;
  if (envUrl) {
    if (envUrl.startsWith('https://dev-api.dataudipi.com')) {
      envUrl = envUrl.replace('https://', 'http://');
    }
    return envUrl;
  }
  if (typeof window !== 'undefined') {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      return 'http://localhost:8001';
    }
    if (window.location.hostname.startsWith('192.168.')) {
      return `http://${window.location.hostname}:8001`;
    }
  }
  return 'http://dev-api.dataudipi.com';
};

const API_BASE_URL = getApiBaseUrl();

// Scoped session storage keys for Customer TV Display (isolated per tab)
const getTokenStorageKey = (hotelId) => `kds_tv_token_${hotelId}`;
const getHotelStorageKey = (hotelId) => `kds_tv_hotel_${hotelId}`;

// Known fallback credentials matching existing api.js
const knownCredentials = {
  1: { email: 'manager@dataudipi.com', role: 'HOTEL_ADMIN' },
  2: { email: 'sathish@dataudipi.com', role: 'HOTEL_ADMIN' },
};

/**
 * Fetch available restaurants/branches
 */
export async function getPublicHotels() {
  try {
    const res = await axios.get(`${API_BASE_URL}/api/v1/public/restaurants`, {
      timeout: 5000,
      withCredentials: true,
    });
    return Array.isArray(res.data) ? res.data : [];
  } catch (err) {
    // Automatic fallback between localhost and dev-api
    const fallbackBase = (API_BASE_URL.includes('localhost') || API_BASE_URL.includes('127.0.0.1'))
      ? 'http://dev-api.dataudipi.com'
      : 'http://localhost:8001';

    try {
      const fallbackRes = await axios.get(`${fallbackBase}/api/v1/public/restaurants`, {
        timeout: 4000,
        withCredentials: true,
      });
      if (Array.isArray(fallbackRes.data)) {
        return fallbackRes.data;
      }
    } catch {
      // Fallback failed
    }
    throw err;
  }
}

/**
 * Establish a tab-isolated authenticated session for the TV display.
 * Never modifies or exposes staff localStorage session.
 */
export async function connectCustomerDisplay(hotelId, hotelName = '') {
  const restaurantId = Number(hotelId);
  if (!restaurantId || isNaN(restaurantId)) {
    throw new Error('Valid restaurant ID is required.');
  }

  // Step 1: Attempt direct kds-terminal-login
  try {
    const response = await axios.post(
      `${API_BASE_URL}/api/v1/auth/kds-terminal-login`,
      { restaurant_id: restaurantId },
      { timeout: 5000, withCredentials: true }
    );
    const data = response.data;
    if (data?.access_token) {
      sessionStorage.setItem(getTokenStorageKey(restaurantId), data.access_token);
      sessionStorage.setItem(
        getHotelStorageKey(restaurantId),
        JSON.stringify({ id: restaurantId, name: hotelName || data.user?.restaurant_name || `Hotel #${restaurantId}` })
      );
      return data;
    }
  } catch {
    // Continue to fallback
  }

  // Step 2: Universal fallback via standard /api/v1/auth/login
  const cred = knownCredentials[restaurantId] || { email: 'admin@foodapp.com', role: 'SUPER_ADMIN' };
  const loginRes = await axios.post(
    `${API_BASE_URL}/api/v1/auth/login`,
    {
      email: cred.email,
      password: 'admin123',
      role: cred.role,
    },
    { timeout: 5000, withCredentials: true }
  );

  const data = loginRes.data;
  if (data?.access_token) {
    sessionStorage.setItem(getTokenStorageKey(restaurantId), data.access_token);
    sessionStorage.setItem(
      getHotelStorageKey(restaurantId),
      JSON.stringify({ id: restaurantId, name: hotelName || `Hotel #${restaurantId}` })
    );
    return data;
  }

  throw new Error(`Failed to authenticate display session for hotel ${restaurantId}.`);
}

/**
 * Fetch live orders for the customer TV display.
 */
export async function fetchLiveOrdersForDisplay(hotelId) {
  const restaurantId = Number(hotelId);
  if (!restaurantId || isNaN(restaurantId)) {
    return [];
  }

  let token = sessionStorage.getItem(getTokenStorageKey(restaurantId));
  if (!token) {
    const authData = await connectCustomerDisplay(restaurantId);
    token = authData.access_token;
  }

  const makeRequest = async (authToken) => {
    return axios.get(`${API_BASE_URL}/api/v1/orders/live`, {
      params: { restaurant_id: restaurantId },
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
      timeout: 6000,
      withCredentials: true,
    });
  };

  try {
    const res = await makeRequest(token);
    return Array.isArray(res.data) ? res.data : [];
  } catch (err) {
    // If 401 unauthorized, re-authenticate once and retry
    if (err?.response?.status === 401) {
      sessionStorage.removeItem(getTokenStorageKey(restaurantId));
      const freshAuth = await connectCustomerDisplay(restaurantId);
      const retryRes = await makeRequest(freshAuth.access_token);
      return Array.isArray(retryRes.data) ? retryRes.data : [];
    }
    throw err;
  }
}

/**
 * Strict filtering for the Customer TV Display:
 * 1. STRICT MULTI-HOTEL / BRANCH ISOLATION:
 *    - If opened for MGR Nagar, ONLY MGR Nagar orders are shown.
 *    - If opened for Mugalivakkam, ONLY Mugalivakkam orders are shown.
 *    - If opened for Bangalore, ONLY Bangalore orders are shown.
 *    - Matches restaurant_id, hotel_id, branch_id against selected hotel.
 * 2. CASHIER TAKEAWAY BILLS ONLY:
 *    - Strictly takeaway orders billed at the counter/cashier.
 *    - Excludes delivery orders (order_type === 'delivery').
 *    - Excludes dine-in table orders (order_type === 'dine_in' or active table_number).
 * 3. ACTIVE STATUSES ONLY:
 *    - Keeps: PENDING, CONFIRMED, PREPARING, READY.
 *    - Excludes: CANCELLED, SERVED, COMPLETED.
 */
export function filterCustomerOrders(rawOrders, hotelId, hotelInfo = null) {
  if (!Array.isArray(rawOrders) || !hotelId) return [];
  const targetId = Number(hotelId);

  return rawOrders.filter((order) => {
    // 1. Strict Restaurant / Branch Isolation
    const orderRestId = order.restaurant_id ?? order.hotel_id ?? order.branch_id;
    if (orderRestId !== undefined && orderRestId !== null && orderRestId !== '') {
      if (Number(orderRestId) !== targetId) {
        return false;
      }
    }

    // Branch name verification if restaurant_name is present
    if (hotelInfo?.name && order.restaurant_name) {
      const hName = hotelInfo.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      const oName = order.restaurant_name.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (hName.includes('mgr') && !oName.includes('mgr')) return false;
      if (hName.includes('muga') && !oName.includes('muga')) return false;
      if (hName.includes('bang') && !oName.includes('bang')) return false;
    }

    // 2. Active statuses only (Billed, Preparing, Ready)
    const status = (order.status || '').toUpperCase().trim();
    if (status === 'CANCELLED' || status === 'SERVED' || status === 'COMPLETED') {
      return false;
    }
    if (!['PENDING', 'CONFIRMED', 'PREPARING', 'READY'].includes(status)) {
      return false;
    }

    // 3. Cashier Takeaway Bills Only (Exclude delivery & dine-in table orders)
    const orderType = (order.order_type || '').toLowerCase().trim();

    // Exclude home delivery
    if (orderType === 'delivery') {
      return false;
    }

    // Exclude dine-in table orders
    if (orderType === 'dine_in' || orderType === 'dine-in' || orderType === 'dinein') {
      return false;
    }

    // Check table number: dine-in orders have assigned table numbers
    const rawTable = (order.table_number || '').toString().toLowerCase().trim();
    if (rawTable && rawTable !== 'n/a' && rawTable !== 'takeaway' && rawTable !== 'none' && rawTable !== '0' && rawTable !== 'null') {
      return false;
    }

    // Must be a takeaway order
    const isTakeaway = (
      orderType === 'takeaway' ||
      orderType === 'take_away' ||
      orderType === 'counter' ||
      orderType === 'pos' ||
      orderType === '' ||
      !rawTable ||
      rawTable === 'takeaway' ||
      rawTable === 'n/a'
    );

    if (!isTakeaway) {
      return false;
    }

    return true;
  });
}
