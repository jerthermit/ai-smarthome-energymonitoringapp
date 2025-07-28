// frontend/src/hooks/useAggregateTelemetry.ts
import { useQuery } from '@tanstack/react-query';
import type { TimeRange } from '../services/deviceService';
import api from '../services/api';

export interface AggregateDataPoint {
  timestamp: string;     // ISO8601 UTC from backend; convert to local in the UI
  value: number;         // total energy (Wh) per bucket from backend aggregate
  device_count: number;  // number of active devices in the bucket
}

export interface UseAggregateTelemetryOptions {
  timeRange?: TimeRange;       // 'hour' | 'day' | 'week' | 'month' (per backend)
  resolutionMinutes?: number;  // 1–1440
  deviceIds?: string[];        // optional device filter
  enabled?: boolean;
  refetchMs?: number;          // override refetch interval (ms)
  staleMs?: number;            // override stale time (ms)
}

export function useAggregateTelemetry({
  timeRange = 'day',
  resolutionMinutes = 15,
  deviceIds,
  enabled = true,
  refetchMs = 30_000,
  staleMs = 10_000,
}: UseAggregateTelemetryOptions = {}) {
  const deviceKey = deviceIds?.length ? [...deviceIds].sort().join(',') : 'all';

  return useQuery<AggregateDataPoint[]>({
    queryKey: ['aggregateTelemetry', timeRange, resolutionMinutes, deviceKey],
    queryFn: async () => {
      const params = {
        time_range: timeRange,
        resolution_minutes: resolutionMinutes,
        // Send as comma-separated to avoid array serializer quirks; backend accepts both.
        device_ids: deviceIds?.length ? deviceIds.join(',') : undefined,
      };

      const { data } = await api.get<AggregateDataPoint[]>('/telemetry/aggregate', { params });
      // Data is already UTC. Consumers should convert to local time when rendering.
      return data;
    },
    refetchInterval: enabled ? refetchMs : false,
    staleTime: staleMs,
    enabled,
  });
}

export default useAggregateTelemetry;