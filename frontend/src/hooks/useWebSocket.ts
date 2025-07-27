import { useEffect, useRef, useState, useCallback, useMemo } from 'react';

// Define the interfaces first
export interface WebSocketMessage {
  type: string;
  [key: string]: any;
}

export interface WebSocketOptions {
  onOpen?: (event: Event) => void;
  onClose?: (event: CloseEvent) => void;
  onError?: (event: Event) => void;
  onMessage?: (message: WebSocketMessage) => void;
  reconnect?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

const useWebSocket = (url: string | null, options: WebSocketOptions = {}) => {
  const {
    onOpen,
    onClose,
    onError,
    onMessage,
    reconnect = true,
    reconnectInterval = 5000,
    maxReconnectAttempts = 5,
  } = options;

  const ws = useRef<WebSocket | null>(null);
  const reconnectAttempts = useRef(0);
  const [isConnected, setIsConnected] = useState(false);
  const reconnectTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messageQueue = useRef<WebSocketMessage[]>([]);

  // Create a stable reference for callbacks
  const callbacks = useMemo(() => ({
    onOpen,
    onClose,
    onError,
    onMessage,
  }), [onOpen, onClose, onError, onMessage]);

  // Function to send messages
  const sendMessage = useCallback((message: WebSocketMessage) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(message));
      return true;
    } else {
      // Queue message if not connected
      messageQueue.current.push(message);
      return false;
    }
  }, []);

  // Function to process message queue
  const processMessageQueue = useCallback(() => {
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN) return;
    
    while (messageQueue.current.length > 0) {
      const message = messageQueue.current.shift();
      if (message) {
        ws.current.send(JSON.stringify(message));
      }
    }
  }, []);

  // Function to connect to WebSocket
  const connect = useCallback(() => {
    if (!url) return;

    // Close existing connection if it exists
    if (ws.current) {
      ws.current.close();
    }

    ws.current = new WebSocket(url);

    ws.current.onopen = (event) => {
      console.log('WebSocket connected');
      setIsConnected(true);
      reconnectAttempts.current = 0;
      callbacks.onOpen?.(event);
      processMessageQueue(); // Send any queued messages
    };

    ws.current.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        callbacks.onMessage?.(data);
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    ws.current.onerror = (event) => {
      console.error('WebSocket error:', event);
      callbacks.onError?.(event);
    };

    ws.current.onclose = (event) => {
      console.log('WebSocket disconnected');
      setIsConnected(false);
      callbacks.onClose?.(event);

      // Attempt to reconnect if needed
      if (reconnect && reconnectAttempts.current < maxReconnectAttempts) {
        reconnectAttempts.current += 1;
        console.log(`Attempting to reconnect (${reconnectAttempts.current}/${maxReconnectAttempts})...`);
        
        // Clear any existing timeout
        if (reconnectTimeout.current) {
          clearTimeout(reconnectTimeout.current);
        }
        
        reconnectTimeout.current = setTimeout(() => {
          connect();
        }, reconnectInterval);
      }
    };
  }, [url, reconnect, reconnectInterval, maxReconnectAttempts, callbacks, processMessageQueue]);

  // Function to manually close the connection
  const closeConnection = useCallback(() => {
    if (ws.current) {
      ws.current.close();
    }
    
    // Clear any pending reconnect attempts
    if (reconnectTimeout.current) {
      clearTimeout(reconnectTimeout.current);
      reconnectTimeout.current = null;
    }
  }, []);

  // Function to manually reconnect
  const reconnectWebSocket = useCallback(() => {
    if (reconnectTimeout.current) {
      clearTimeout(reconnectTimeout.current);
      reconnectTimeout.current = null;
    }
    reconnectAttempts.current = 0;
    connect();
  }, [connect]);

  // Connect on mount and when URL changes
  useEffect(() => {
    if (url) {
      connect();
    }

    // Cleanup on unmount
    return () => {
      closeConnection();
    };
  }, [url, connect, closeConnection]);

  // Expose methods and state
  return {
    isConnected,
    sendMessage,
    closeConnection,
    reconnect: reconnectWebSocket,
  };
};

// Export the hook
export { useWebSocket };
