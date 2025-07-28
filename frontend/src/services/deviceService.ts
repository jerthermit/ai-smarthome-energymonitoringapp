import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1';

export type TimeRange = 'hour' | 'day' | 'week' | 'month';

export interface Device {
  id: string;
  name: string;
  type: string;
  status: 'online' | 'offline';
  created_at: string;
  updated_at: string;
  user_id: string;
  current_power?: number; // in watts
}

export const fetchDevices = async (): Promise<Device[]> => {
  try {
    const response = await axios.get<Device[]>(`${API_BASE_URL}/telemetry/devices`, {
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching devices:', error);
    // Handle 404 specifically to provide a better error message
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      console.error('Devices endpoint not found. Please ensure the backend is running and the endpoint is correct.');
    }
    throw error;
  }
};

export const fetchDeviceTelemetry = async (deviceId: string) => {
  try {
    const response = await axios.get(`${API_BASE_URL}/telemetry?device_id=${deviceId}`, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    });
    return response.data;
  } catch (error) {
    console.error(`Error fetching telemetry for device ${deviceId}:`, error);
    throw error;
  }
};

export const updateDeviceStatus = async (deviceId: string, status: 'online' | 'offline'): Promise<Device> => {
  try {
    const response = await axios.patch<Device>(
      `${API_BASE_URL}/telemetry/devices/${deviceId}/status`,
      { status },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      }
    );
    return response.data;
  } catch (error) {
    console.error(`Error updating device ${deviceId} status:`, error);
    if (axios.isAxiosError(error)) {
      console.error('Error details:', {
        status: error.response?.status,
        data: error.response?.data,
        endpoint: error.config?.url
      });
    }
    throw error;
  }
};
