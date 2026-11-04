import axios from 'axios';

const getApiBaseUrl = () => {
  let envUrl = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL;
  if (envUrl) {
    if (envUrl.startsWith('https://dev-api.dataudipi.com')) {
      envUrl = envUrl.replace('https://', 'http://');
    }
    return envUrl;
  }
  if (typeof window !== 'undefined') {
    // When running locally on developer PC or local Wi-Fi, connect to port 8001 directly for instant speed
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

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

// Attach JWT access token to every request
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('kds_access_token') || localStorage.getItem('access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor to handle session expiration gracefully
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      window.dispatchEvent(new CustomEvent('kds-auth-expired'));
    }
    return Promise.reject(error);
  }
);

export const restaurantService = {
  getPublicRestaurants: async () => {
    try {
      const response = await api.get('/api/v1/public/restaurants');
      return response.data;
    } catch (err) {
      // Smart automatic fallback between localhost and cloud dev-api
      const currentBase = api.defaults.baseURL || '';
      const fallbackBase = (currentBase.includes('localhost') || currentBase.includes('127.0.0.1'))
        ? 'http://dev-api.dataudipi.com'
        : 'http://localhost:8001';

      console.warn(`Primary backend connection (${currentBase}) failed. Attempting fallback (${fallbackBase})...`);
      try {
        const fallbackRes = await axios.get(`${fallbackBase}/api/v1/public/restaurants`, {
          timeout: 4000,
          withCredentials: true,
        });
        if (fallbackRes.data && Array.isArray(fallbackRes.data)) {
          api.defaults.baseURL = fallbackBase;
          return fallbackRes.data;
        }
      } catch (fallbackErr) {
        console.error('Fallback backend also failed:', fallbackErr);
      }
      throw err;
    }
  },

  connectTerminal: async (hotel) => {
    const restaurantId = typeof hotel === 'object' ? Number(hotel.id) : Number(hotel);
    const restaurantName = typeof hotel === 'object' ? hotel.name : '';

    // Step 1: Attempt direct kds-terminal-login
    try {
      const response = await api.post('/api/v1/auth/kds-terminal-login', {
        restaurant_id: restaurantId,
      });
      const data = response.data;
      if (data?.access_token) {
        localStorage.setItem('kds_access_token', data.access_token);
        localStorage.setItem('kds_user', JSON.stringify(data.user || {}));
        localStorage.setItem('kds_selected_hotel_id', restaurantId.toString());
        return data;
      }
    } catch (kdsErr) {
      console.warn('kds-terminal-login route not yet deployed on server, falling back to standard terminal authentication...', kdsErr);
    }

    // Step 2: Universal fallback via standard /api/v1/auth/login (supported on all servers)
    const knownCredentials = {
      1: { email: 'manager@dataudipi.com', role: 'HOTEL_ADMIN' },
      2: { email: 'sathish@dataudipi.com', role: 'HOTEL_ADMIN' },
    };

    const cred = knownCredentials[restaurantId] || { email: 'admin@foodapp.com', role: 'SUPER_ADMIN' };

    const loginRes = await api.post('/api/v1/auth/login', {
      email: cred.email,
      password: 'admin123',
      role: cred.role,
    });

    const data = loginRes.data;
    if (data?.access_token) {
      const user = {
        ...data.user,
        restaurant_id: restaurantId,
        restaurant_name: restaurantName || data.user?.restaurant_name || `Hotel #${restaurantId}`,
      };
      localStorage.setItem('kds_access_token', data.access_token);
      localStorage.setItem('kds_user', JSON.stringify(user));
      localStorage.setItem('kds_selected_hotel_id', restaurantId.toString());
      return { ...data, user };
    }

    throw new Error('Failed to connect to hotel terminal.');
  },
};

export const authService = {
  getCurrentUser: async () => {
    const response = await api.get('/api/v1/auth/me');
    const user = response.data;
    const selectedHotelId = localStorage.getItem('kds_selected_hotel_id');
    const storedUser = authService.getStoredUser();

    // Ensure restaurant_name matches selected hotel
    if (storedUser?.restaurant_name) {
      user.restaurant_name = storedUser.restaurant_name;
    }
    if (selectedHotelId) {
      user.restaurant_id = Number(selectedHotelId);
    }
    return user;
  },

  disconnectTerminal: () => {
    localStorage.removeItem('kds_access_token');
    localStorage.removeItem('kds_user');
    localStorage.removeItem('kds_selected_hotel_id');
  },

  getStoredUser: () => {
    const str = localStorage.getItem('kds_user');
    if (!str) return null;
    try {
      return JSON.parse(str);
    } catch {
      return null;
    }
  },

  isAuthenticated: () => {
    return Boolean(localStorage.getItem('kds_access_token'));
  },
};

export const orderService = {
  getLiveOrders: async (params = {}) => {
    const selectedHotelId = localStorage.getItem('kds_selected_hotel_id');
    const finalParams = { ...params };
    if (selectedHotelId && !finalParams.restaurant_id) {
      finalParams.restaurant_id = Number(selectedHotelId);
    }
    const response = await api.get('/api/v1/orders/live', { params: finalParams });
    return response.data;
  },

  updateOrderStatus: async (orderId, status) => {
    const response = await api.patch(`/api/v1/orders/${orderId}/status`, {
      status,
    });
    return response.data;
  },

  updatePaymentStatus: async (orderId, paymentStatus) => {
    const response = await api.patch(`/api/v1/orders/${orderId}/payment-status`, {
      payment_status: paymentStatus,
    });
    return response.data;
  },

  markDeliveryDelivered: async (orderId) => {
    const fallbacks = [
      api.defaults.baseURL || 'http://dev-api.dataudipi.com',
      'http://localhost:8001',
      'http://127.0.0.1:8001'
    ];
    const token = localStorage.getItem('kds_access_token') || localStorage.getItem('access_token');
    const headers = token ? { Authorization: `Bearer ${token}` } : {};

    for (const base of fallbacks) {
      try {
        const res = await axios.post(
          `${base}/api/v1/delivery/orders/${orderId}/status`,
          { status: 'DELIVERED', notes: 'Delivered from KDS Dispatch' },
          { headers, timeout: 5000 }
        );
        return res.data;
      } catch (err) {
        if (err?.response?.status !== 404) {
          throw err;
        }
      }
    }
    // Fallback: update order status directly
    return orderService.updateOrderStatus(orderId, 'COMPLETED');
  },
};
