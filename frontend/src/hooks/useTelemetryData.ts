// frontend/src/hooks/useTelemetryData.ts

import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useWebSocketContext } from '../contexts/WebSocketContext';
import api from '../services/api';
import type { TimeRange } from '../types/dashboard';

export type TelemetryData = {
  id: number;
  deviceId: string;    // camelCase to match backend alias
  timestamp: string;   // ISO8601 UTC from backend
  energyWatts: number; // instantaneous power in watts
  createdAt: string;   // ISO8601 UTC
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
  timeRange: TimeRange, // 'day' | '3days' | 'week'
  options: UseTelemetryDataOptions = {}
) {
  const { deviceId, realtime = true, pollingInterval = 30000 } = options;
  const queryClient = useQueryClient();
  const { isConnected, sendMessage, subscribe, unsubscribe } = useWebSocketContext();
  const channelRef = useRef<string | null>(null);
  const lastUpdateRef = useRef<Date>(new Date());

  // 1) Subscribe/unsubscribe to WS channel
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

  // 2) Handle incoming WS messages
  useEffect(() => {
    if (!deviceId || !realtime || !channelRef.current) return;

    const handleMessage = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data) as EnergyUpdateMessage;
        if (msg.type === 'energyUpdate' && msg.deviceId === deviceId) {
          lastUpdateRef.current = new Date();
          queryClient.setQueryData<TelemetryData[]>(
            ['telemetry', timeRange, deviceId ?? 'all'],
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
                  id: Date.now(), // client-side temp id
                  deviceId: msg.deviceId,
                  timestamp: msg.timestamp,     // keep as UTC string
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

  // 3) Query initial & fallback data via HTTP (UTC in; UI converts to local when rendering)
  const query = useQuery<TelemetryData[], Error>({
    queryKey: ['telemetry', timeRange, deviceId ?? 'all'],
    queryFn: async () => {
      const end = new Date();       // browser local now
      const start = new Date(end);  // clone

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
        start_time: start.toISOString(), // send as UTC ISO 8601
        end_time: end.toISOString(),
        limit: '1000',
        ...(deviceId ? { device_id: deviceId } : {}),
      };

      const { data } = await api.get<TelemetryData[]>('/telemetry', { params });
      lastUpdateRef.current = new Date();
      return data;
    },
    staleTime: 5 * 60 * 1000,
    refetchInterval: realtime && isConnected ? false : pollingInterval,
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