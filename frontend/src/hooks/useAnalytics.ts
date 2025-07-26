import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import type { TelemetryData } from './useEnergyData';

type TimeRange = 'day' | 'week' | 'month';

export const useAnalytics = (timeRange: TimeRange = 'week') => {
  const fetchAnalytics = async (): Promise<{
    topDevices: Array<{ deviceId: string; totalEnergy: number; name?: string }>;
    hourlyData: Array<{ hour: number; averageEnergy: number }>;
  }> => {
    try {
      // Fetch all telemetry data for the selected time range
      const response = await axios.get('/api/v1/telemetry', {
        params: {
          limit: 10000, // Adjust based on your data volume
        },
      });

      const data: TelemetryData[] = response.data;
      
      // Calculate top devices by energy consumption
      const deviceEnergy = data.reduce((acc, item) => {
        if (!acc[item.deviceId]) {
          acc[item.deviceId] = 0;
        }
        acc[item.deviceId] += item.energyWatts;
        return acc;
      }, {} as Record<string, number>);

      const topDevices = Object.entries(deviceEnergy)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3) // Top 3 devices
        .map(([deviceId, totalEnergy]) => ({
          deviceId,
          totalEnergy: parseFloat((totalEnergy / 1000).toFixed(2)), // Convert to kWh
        }));

      // Calculate hourly averages
      const hourlyData = Array(24).fill(0).map((_, hour) => {
        const hourData = data.filter(item => {
          const date = new Date(item.timestamp);
          return date.getHours() === hour;
        });
        
        const total = hourData.reduce((sum, item) => sum + item.energyWatts, 0);
        const average = hourData.length > 0 ? total / hourData.length : 0;
        
        return {
          hour,
          averageEnergy: parseFloat((average / 1000).toFixed(3)), // Convert to kWh
        };
      });

      return { topDevices, hourlyData };
    } catch (error) {
      console.error('Error fetching analytics data:', error);
      return { topDevices: [], hourlyData: [] };
    }
  };

  return useQuery({
    queryKey: ['analytics', timeRange],
    queryFn: fetchAnalytics,
  });
};

export default useAnalytics;
