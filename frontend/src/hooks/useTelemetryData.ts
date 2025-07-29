import { useQuery } from '@tanstack/react-query';
import api from '../services/api';

export type TelemetryData = {
  id: number;
  deviceId: string;
  timestamp: string;
  energyWatts: number;
  createdAt: string;
};

interface UseRawTelemetryOptions {
  deviceId?: string;
  startTime: Date;
  endTime: Date;
  enabled?: boolean;
}

/**
 * A hook for fetching raw, granular telemetry data for a specific, absolute time range.
 * This should NOT be used for dashboard analytics, as its time window is not calendar-aligned.
 *
 * @deprecated Prefer using data from `useAnalytics` for all dashboarding purposes.
 */
export function useTelemetryData({
  deviceId,
  startTime,
  endTime,
  enabled = true,
}: UseRawTelemetryOptions) {
  
  const query = useQuery<TelemetryData[], Error>({
    queryKey: ['rawTelemetry', deviceId ?? 'all', startTime.toISOString(), endTime.toISOString()],
    
    queryFn: async () => {
      const params: Record<string, string> = {
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        limit: '10000', // Allow fetching more raw data
        ...(deviceId ? { device_id: deviceId } : {}),
      };

      const { data } = await api.get<TelemetryData[]>('/telemetry', { params });
      return data;
    },
    
    enabled,
    refetchOnWindowFocus: false, // Not typically needed for historical raw data
    staleTime: Infinity, // Raw historical data is not expected to change
  });

  return query;
}