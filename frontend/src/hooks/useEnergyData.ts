import { useQuery } from '@tanstack/react-query';
import axios from 'axios';

export type TimeRange = 'day' | 'week' | 'month';

export type TelemetryData = {
  id: number;
  deviceId: string;    // Changed from device_id
  timestamp: string;
  energyWatts: number; // Changed from energy_watts
  createdAt: string;   // Changed from created_at
};

export const useEnergyData = (timeRange: TimeRange) => {
  return useQuery<TelemetryData[], Error>({
    queryKey: ['energyData', timeRange],
    queryFn: async () => {
      const endDate = new Date();
      const startDate = new Date();
      
      // Set date range based on timeRange
      switch (timeRange) {
        case 'day':
          startDate.setDate(startDate.getDate() - 1);
          break;
        case 'week':
          startDate.setDate(startDate.getDate() - 7);
          break;
        case 'month':
          startDate.setMonth(startDate.getMonth() - 1);
          break;
      }

      console.log('Fetching telemetry data with params:', {
        start_time: startDate.toISOString(),
        end_time: endDate.toISOString(),
        limit: 1000
      });

      try {
        console.log('Making API request with params:', {
          start_time: startDate.toISOString(),
          end_time: endDate.toISOString(),
          limit: 1000
        });

        const response = await axios.get('/api/v1/telemetry', {
          params: {
            start_time: startDate.toISOString(),
            end_time: endDate.toISOString(),
            limit: 1000
          },
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
            'Accept': 'application/json'
          }
        });

        console.log('API Response Status:', response.status);
        console.log('API Response Headers:', response.headers);
        console.log('API Response Data:', {
          dataType: typeof response.data,
          isArray: Array.isArray(response.data),
          itemCount: Array.isArray(response.data) ? response.data.length : 'N/A',
          firstItem: Array.isArray(response.data) && response.data[0] ? response.data[0] : 'N/A'
        });

        // Log the first few items if available
        if (Array.isArray(response.data) && response.data.length > 0) {
          console.log('First 3 items:', response.data.slice(0, 3));
        }

        return response.data;
      } catch (error: any) {
        if (error.response) {
          console.error('Error in useEnergyData:', {
            status: error.response.status,
            statusText: error.response.statusText,
            data: error.response.data
          });
        } else if (error.request) {
          console.error('No response received:', error.request);
        } else {
          console.error('Error setting up request:', error.message);
        }
        console.error('Full error object:', error);
        throw error;
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 2,
  });
};
