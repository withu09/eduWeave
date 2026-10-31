import { useEffect, useRef, useState, useCallback } from 'react';

type MessageHandler = (data: any) => void;

interface UseRobustWebSocketOptions {
  url: string;
  onMessage: MessageHandler;
  maxReconnectAttempts?: number;
  baseReconnectDelay?: number;
}

export function useRobustWebSocket({
  url,
  onMessage,
  maxReconnectAttempts = 5,
  baseReconnectDelay = 1000,
}: UseRobustWebSocketOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttempt = useRef(0);
  const onMessageRef = useRef(onMessage);

  // Keep the latest onMessage callback without re-triggering effect
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  const connect = useCallback(() => {
    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        setError(null);
        reconnectAttempt.current = 0; // Reset on successful connect
      };

      ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          onMessageRef.current(parsed);
        } catch (e) {
          console.error("Failed to parse websocket message", e);
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        if (reconnectAttempt.current < maxReconnectAttempts) {
          const delay = baseReconnectDelay * Math.pow(2, reconnectAttempt.current);
          reconnectAttempt.current++;
          setTimeout(connect, delay);
        } else {
          setError(new Error("WebSocket disconnected and max reconnect attempts reached"));
        }
      };

      ws.onerror = (e) => {
        console.error("WebSocket error", e);
        ws.close();
      };
    } catch (err: any) {
      setError(err);
    }
  }, [url, maxReconnectAttempts, baseReconnectDelay]);

  useEffect(() => {
    connect();
    return () => {
      if (wsRef.current) {
        // Prevent reconnect loop on unmount
        reconnectAttempt.current = maxReconnectAttempts; 
        wsRef.current.close();
      }
    };
  }, [connect, maxReconnectAttempts]);

  const sendMessage = useCallback((msg: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    } else {
      console.warn("Cannot send message: WebSocket is not open");
    }
  }, []);

  return { isConnected, error, sendMessage };
}
