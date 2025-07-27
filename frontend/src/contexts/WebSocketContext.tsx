import React, { createContext, useContext, useMemo } from 'react';
import { useWebSocket, type WebSocketMessage } from '../hooks/useWebSocket';

interface WebSocketContextType {
  isConnected: boolean;
  sendMessage: (message: WebSocketMessage) => boolean;
  closeConnection: () => void;
  reconnect: () => void;
  subscribe: (channel: string) => void;
  unsubscribe: (channel: string) => void;
  isSubscribed: (channel: string) => boolean;
}

const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined);

interface WebSocketProviderProps {
  url: string | null;
  children: React.ReactNode;
  onMessage?: (message: WebSocketMessage) => void;
}

export const WebSocketProvider: React.FC<WebSocketProviderProps> = ({ 
  url, 
  children,
  onMessage
}) => {
  const [subscriptions, setSubscriptions] = React.useState<Set<string>>(new Set());
  
  const { isConnected, sendMessage, closeConnection, reconnect } = useWebSocket(url, {
    onMessage: (message) => {
      // Forward all messages to the provided handler
      onMessage?.(message);
    },
    reconnect: true,
    reconnectInterval: 3000,
    maxReconnectAttempts: 5,
  });

  // Subscribe to a channel
  const subscribe = React.useCallback((channel: string) => {
    if (!channel) return;
    
    setSubscriptions(prev => {
      // If already subscribed, do nothing
      if (prev.has(channel)) return prev;
      
      // Send subscription message
      sendMessage({
        type: 'subscribe',
        channel,
      });
      
      // Add to local subscriptions
      const newSubs = new Set(prev);
      newSubs.add(channel);
      return newSubs;
    });
  }, [sendMessage]);

  // Unsubscribe from a channel
  const unsubscribe = React.useCallback((channel: string) => {
    if (!channel) return;
    
    setSubscriptions(prev => {
      // If not subscribed, do nothing
      if (!prev.has(channel)) return prev;
      
      // Send unsubscription message
      sendMessage({
        type: 'unsubscribe',
        channel,
      });
      
      // Remove from local subscriptions
      const newSubs = new Set(prev);
      newSubs.delete(channel);
      return newSubs;
    });
  }, [sendMessage]);

  // Check if subscribed to a channel
  const isSubscribed = React.useCallback((channel: string) => {
    return subscriptions.has(channel);
  }, [subscriptions]);

  // Value to be provided by the context
  const value = useMemo(() => ({
    isConnected,
    sendMessage,
    closeConnection,
    reconnect,
    subscribe,
    unsubscribe,
    isSubscribed,
  }), [
    isConnected,
    sendMessage,
    closeConnection,
    reconnect,
    subscribe,
    unsubscribe,
    isSubscribed,
  ]);

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
};

export const useWebSocketContext = (): WebSocketContextType => {
  const context = useContext(WebSocketContext);
  if (context === undefined) {
    throw new Error('useWebSocketContext must be used within a WebSocketProvider');
  }
  return context;
};

export default WebSocketContext;
