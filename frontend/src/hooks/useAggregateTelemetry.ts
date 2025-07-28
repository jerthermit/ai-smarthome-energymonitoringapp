import { useQuery } from '@tanstack/react-query';
import type { TimeRange } from '../services/deviceService';
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1';

export interface AggregateDataPoint {
  timestamp: string;
  value: number;
  device_count: number;
}

export interface UseAggregateTelemetryOptions {
  timeRange?: TimeRange;
  resolutionMinutes?: number;
  deviceIds?: string[];
  enabled?: boolean;
}

export function useAggregateTelemetry({
  timeRange = 'day',
  resolutionMinutes = 15,
  deviceIds,
  enabled = true,
}: UseAggregateTelemetryOptions = {}) {
  return useQuery({
    queryKey: ['aggregateTelemetry', timeRange, resolutionMinutes, deviceIds],
    queryFn: async () => {
      const response = await axios.get(`${API_BASE_URL}/telemetry/aggregate`, {
        params: {
          time_range: timeRange,
          resolution_minutes: resolutionMinutes,
          device_ids: deviceIds?.join(','),
        },
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Accept': 'application/json',
        },
      });
      return response.data;
    },
    refetchInterval: 30000, // 30 seconds
    staleTime: 10000, // 10 seconds
    enabled: enabled,
  });
}

export default useAggregateTelemetry;
