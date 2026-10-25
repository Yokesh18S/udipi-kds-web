import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || 'http://dev-api.dataudipi.com';

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
    const response = await api.get('/api/v1/public/restaurants');
    return response.data;
  },

  connectTerminal: async (restaurantId) => {
    const response = await api.post('/api/v1/auth/kds-terminal-login', {
      restaurant_id: Number(restaurantId),
    });
    const data = response.data;
    if (data.access_token) {
      localStorage.setItem('kds_access_token', data.access_token);
      localStorage.setItem('kds_user', JSON.stringify(data.user || {}));
      localStorage.setItem('kds_selected_hotel_id', restaurantId.toString());
    }
    return data;
  },
};

export const authService = {
  getCurrentUser: async () => {
    const response = await api.get('/api/v1/auth/me');
    return response.data;
  },

  disconnectTerminal: () => {
    localStorage.removeItem('kds_access_token');
    localStorage.removeItem('kds_user');
    localStorage.removeItem('kds_selected_hotel_id');
  },

  getStoredUser: () => {
    try {
      const u = localStorage.getItem('kds_user');
      return u ? JSON.parse(u) : null;
    } catch {
      return null;
    }
  },

  hasValidToken: () => {
    return Boolean(localStorage.getItem('kds_access_token'));
  },
};

export const orderService = {
  getLiveOrders: async (params = {}) => {
    const response = await api.get('/api/v1/orders/live', { params });
    return response.data;
  },

  updateOrderStatus: async (orderId, status) => {
    const response = await api.patch(`/api/v1/orders/${orderId}/status`, { status });
    return response.data;
  },

  updateOrderPaymentStatus: async (orderId, payment_status) => {
    const response = await api.patch(`/api/v1/orders/${orderId}/payment-status`, { payment_status });
    return response.data;
  },
};

export { API_BASE_URL };
