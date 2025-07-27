// frontend/src/hooks/useTelemetryData.ts

import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { useWebSocketContext } from '../contexts/WebSocketContext';

export type TimeRange = 'day' | 'week' | 'month';

export type TelemetryData = {
  id: number;
  deviceId: string;    // Changed from device_id
  timestamp: string;
  energyWatts: number; // Changed from energy_watts
  createdAt: string;   // Changed from created_at
};

interface EnergyUpdateMessage {
  type: 'energyUpdate';
  deviceId: string;
  timestamp: string;
  value: number;
}

interface UseTelemetryDataOptions {
  deviceId?: string;
  realtime?: boolean;
  pollingInterval?: number;
}

export function useTelemetryData(
  timeRange: TimeRange,
  options: UseTelemetryDataOptions = {}
) {
  const { deviceId, realtime = true, pollingInterval = 30000 } = options;
  const queryClient = useQueryClient();
  const { isConnected, sendMessage, subscribe, unsubscribe } = useWebSocketContext();
  const channelRef = useRef<string | null>(null);
  const lastUpdateRef = useRef<Date>(new Date());

  // 1. Subscribe/unsubscribe to WS channel
  useEffect(() => {
    if (!deviceId || !realtime) return;
    const channel = `energy_${deviceId}`;
    channelRef.current = channel;
    subscribe(channel);
    return () => {
      if (channelRef.current) {
        unsubscribe(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [deviceId, realtime, subscribe, unsubscribe]);

  // 2. Handle incoming WS messages
  useEffect(() => {
    if (!deviceId || !realtime || !channelRef.current) return;
    const handleMessage = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data) as EnergyUpdateMessage;
        if (msg.type === 'energyUpdate' && msg.deviceId === deviceId) {
          lastUpdateRef.current = new Date();
          queryClient.setQueryData<TelemetryData[]>(
            ['telemetry', timeRange, deviceId],
            (old = []) => {
              const exists = old.some(
                item =>
                  new Date(item.timestamp).getTime() ===
                  new Date(msg.timestamp).getTime()
              );
              if (exists) return old;
              return [
                ...old,
                {
                  id: Date.now(),
                  deviceId: msg.deviceId,
                  timestamp: msg.timestamp,
                  energyWatts: msg.value,
                  createdAt: new Date().toISOString(),
                },
              ].sort(
                (a, b) =>
                  new Date(a.timestamp).getTime() -
                  new Date(b.timestamp).getTime()
              );
            }
          );
        }
      } catch (err) {
        console.error('WS message parsing error:', err);
      }
    };

    const ws = (sendMessage as any).ws;
    ws?.addEventListener('message', handleMessage);
    return () => {
      ws?.removeEventListener('message', handleMessage);
    };
  }, [deviceId, realtime, sendMessage, timeRange, queryClient]);

  // 3. Query initial & fallback data via HTTP
  const query = useQuery<TelemetryData[], Error>({
    queryKey: ['telemetry', timeRange, deviceId],
    queryFn: async () => {
      const end = new Date();
      const start = new Date();
      switch (timeRange) {
        case 'day':
          start.setDate(end.getDate() - 1);
          break;
        case 'week':
          start.setDate(end.getDate() - 7);
          break;
        case 'month':
          start.setMonth(end.getMonth() - 1);
          break;
      }
      const params: Record<string, string> = {
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        limit: '1000',
      };
      if (deviceId) params.device_id = deviceId;
      const resp = await axios.get<TelemetryData[]>('/api/v1/telemetry', {
        params,
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
          Accept: 'application/json',
        },
      });
      lastUpdateRef.current = new Date();
      return resp.data;
    },
    staleTime: 5 * 60 * 1000,
    refetchInterval:
      realtime && isConnected ? false : pollingInterval,
    refetchOnWindowFocus: false,
    retry: 2,
  });

  return {
    ...query,
    lastUpdated: lastUpdateRef.current,
    isUsingWebSocket: realtime && isConnected,
    isUsingPolling: !realtime || !isConnected,
    refetch: () => {
      lastUpdateRef.current = new Date();
      return query.refetch();
    },
  };
}