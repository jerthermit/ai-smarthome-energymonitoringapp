// frontend/src/services/authService.ts
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

export interface User {
  id: number;
  email: string;
  full_name: string | null;
  is_active: boolean;
  is_superuser: boolean;
  created_at: string;
  updated_at: string | null;
}

interface LoginResponse {
  access_token: string;
  token_type: string;
}

export const authService = {
  async login(email: string, password: string): Promise<User> {
    const formData = new URLSearchParams();
    formData.append('username', email);
    formData.append('password', password);

    const response = await axios.post<LoginResponse>(
      `${API_URL}/auth/login`,
      formData,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    const { access_token } = response.data;
    localStorage.setItem('token', access_token);
    
    // Get user info after successful login
    const userResponse = await this.getCurrentUser();
    if (!userResponse) {
      throw new Error('Failed to fetch user data after login');
    }
    return userResponse;
  },

  async register(email: string, password: string, full_name?: string): Promise<User> {
    try {
      const response = await axios.post<User>(
        `${API_URL}/auth/register`,
        { 
          email, 
          password,
          full_name: full_name?.trim() || undefined
        },
        {
          headers: {
            'Content-Type': 'application/json',
          }
        }
      );
      return response.data;
    } catch (error) {
      console.error('Registration API error:', error);
      throw error;
    }
  },

  async getCurrentUser(): Promise<User | null> {
    const token = localStorage.getItem('token');
    if (!token) return null;

    try {
      const response = await axios.get<User>(`${API_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return response.data;
    } catch (error) {
      this.logout();
      return null;
    }
  },

  logout(): void {
    localStorage.removeItem('token');
  },

  getAuthHeader(): { Authorization: string } | {} {
    const token = localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  },
};

// Add axios interceptor to include auth token in requests
axios.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default authService;