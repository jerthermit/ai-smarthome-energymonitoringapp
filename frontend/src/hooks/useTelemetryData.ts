import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../services/api';
import type { TimeRange } from '../types/dashboard';

export type TelemetryData = {
  id: number;
  deviceId: string;
  timestamp: string;
  energyWatts: number;
  createdAt: string;
};

interface UseTelemetryDataOptions {
  deviceId?: string;
  realtime?: boolean;
  pollingInterval?: number;
}

export function useTelemetryData(
  timeRange: TimeRange, // 'day' | '3days' | 'week'
  options: UseTelemetryDataOptions = {}
) {
  const { 
    deviceId, 
    realtime = true, 
    // Default polling to 5 seconds to match the backend simulation
    pollingInterval = 5000 
  } = options;
  
  const [lastUpdated, setLastUpdated] = useState(new Date());

  const query = useQuery<TelemetryData[], Error>({
    // The query key uniquely identifies this data
    queryKey: ['telemetry', timeRange, deviceId ?? 'all'],
    
    // The function that fetches the data from your API
    queryFn: async () => {
      const end = new Date();
      const start = new Date(end);

      switch (timeRange) {
        case 'day':
          start.setDate(end.getDate() - 1);
          break;
        case '3days':
          start.setDate(end.getDate() - 3);
          break;
        case 'week':
          start.setDate(end.getDate() - 7);
          break;
      }

      const params: Record<string, string> = {
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        limit: '1000',
        ...(deviceId ? { device_id: deviceId } : {}),
      };

      const { data } = await api.get<TelemetryData[]>('/telemetry', { params });
      setLastUpdated(new Date());
      return data;
    },
    
    // --- Polling Configuration ---
    // If realtime is true, refetch data every `pollingInterval` milliseconds.
    refetchInterval: realtime ? pollingInterval : false,
    
    // Keep data fresh, refetch on window focus is good for dashboards.
    refetchOnWindowFocus: true,
    staleTime: pollingInterval / 2,
    retry: 2,
  });

  return {
    ...query,
    lastUpdated: lastUpdated,
    // We are no longer using WebSockets in this hook
    isUsingWebSocket: false,
    isUsingPolling: realtime,
    refetch: () => {
      setLastUpdated(new Date());
      return query.refetch();
    },
  };
}