import { useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { useEffect, useRef } from 'react';
import { useWebSocketContext } from '../contexts/WebSocketContext';

interface EnergyUpdateMessage {
  type: 'energyUpdate';
  deviceId: string;
  timestamp: string;
  value: number;
}

export type TimeRange = 'day' | 'week' | 'month';

export type TelemetryData = {
  id: number;
  deviceId: string;    // Changed from device_id
  timestamp: string;
  energyWatts: number; // Changed from energy_watts
  createdAt: string;   // Changed from created_at
};

interface UseEnergyDataOptions {
  deviceId?: string;
  realtime?: boolean;
  pollingInterval?: number;
}

export const useEnergyData = (timeRange: TimeRange, options: UseEnergyDataOptions = {}) => {
  const { deviceId, realtime = true, pollingInterval = 30000 } = options;
  const queryClient = useQueryClient();
  const { isConnected, sendMessage, subscribe, unsubscribe } = useWebSocketContext();
  const channelRef = useRef<string | null>(null);
  const lastUpdateRef = useRef<Date>(new Date());

  // Format the WebSocket channel name
  useEffect(() => {
    if (!deviceId || !realtime) return;
    
    const channel = `energy_${deviceId}`;
    channelRef.current = channel;
    
    // Subscribe to the channel
    subscribe(channel);
    
    return () => {
      // Unsubscribe when component unmounts or dependencies change
      if (channelRef.current) {
        unsubscribe(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [deviceId, realtime, subscribe, unsubscribe]);

  // Handle WebSocket messages
  useEffect(() => {
    if (!deviceId || !realtime || !channelRef.current) return;
    
    const handleMessage = (event: MessageEvent) => {
      try {
        const message = JSON.parse(event.data) as EnergyUpdateMessage;
        
        if (message.type === 'energyUpdate' && message.deviceId === deviceId) {
          lastUpdateRef.current = new Date();
          
          // Update the query cache with the new data point
          queryClient.setQueryData<TelemetryData[]>(['energyData', timeRange, deviceId], (oldData = []) => {
            // Check if we already have this data point
            const exists = oldData.some(
              item => new Date(item.timestamp).getTime() === new Date(message.timestamp).getTime()
            );
            
            if (exists) return oldData;
            
            // Add new data point
            return [
              ...oldData,
              {
                id: Date.now(), // Temporary ID
                deviceId: message.deviceId,
                timestamp: message.timestamp,
                energyWatts: message.value,
                createdAt: new Date().toISOString(),
              }
            ].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
          });
        }
      } catch (error) {
        console.error('Error processing WebSocket message:', error);
      }
    };

    // Add event listener for WebSocket messages
    const ws = (sendMessage as any).ws; // Access the underlying WebSocket instance
    if (ws && ws.addEventListener) {
      ws.addEventListener('message', handleMessage);
    }

    return () => {
      if (ws && ws.removeEventListener) {
        ws.removeEventListener('message', handleMessage);
      }
    };
  }, [deviceId, queryClient, realtime, sendMessage, timeRange]);

  const query = useQuery<TelemetryData[], Error>({
    queryKey: ['energyData', timeRange, deviceId],
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
        const params: Record<string, string> = {
          start_time: startDate.toISOString(),
          end_time: endDate.toISOString(),
          limit: '1000'
        };
        
        if (deviceId) {
          params.device_id = deviceId;
        }

        console.log('Making API request with params:', params);

        const response = await axios.get('/api/v1/telemetry', {
          params,
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
            'Accept': 'application/json'
          }
        });

        console.log('API Response Status:', response.status);
        
        // Only log detailed response in development
        if (process.env.NODE_ENV === 'development') {
          console.log('API Response Data:', {
            dataType: typeof response.data,
            isArray: Array.isArray(response.data),
            itemCount: Array.isArray(response.data) ? response.data.length : 'N/A',
            firstItem: Array.isArray(response.data) && response.data[0] ? response.data[0] : 'N/A'
          });

          if (Array.isArray(response.data) && response.data.length > 0) {
            console.log('First 3 items:', response.data.slice(0, 3));
          }
        }

        // Update last update time
        lastUpdateRef.current = new Date();
        
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
    refetchInterval: realtime && isConnected ? false : pollingInterval, // Only poll if not using WebSocket
    refetchOnWindowFocus: false,
    retry: 2,
  });

  // Return the query result with additional metadata
  return {
    ...query,
    lastUpdated: lastUpdateRef.current,
    isUsingWebSocket: realtime && isConnected,
    isUsingPolling: !realtime || !isConnected,
    refetch: () => {
      lastUpdateRef.current = new Date();
      return query.refetch();
    }
  };
};
