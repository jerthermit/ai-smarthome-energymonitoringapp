// API configuration
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1';

// Auth configuration
export const AUTH_TOKEN_KEY = 'energy_monitoring_auth_token';

export default {
  API_BASE_URL,
  AUTH_TOKEN_KEY,
};
