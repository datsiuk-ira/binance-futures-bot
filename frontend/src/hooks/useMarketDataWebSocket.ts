import { useState, useEffect, useRef, useCallback } from 'react';
import { Kline, IndicatorData, MarketDataMessage } from '../types/marketData'; // Updated import
import { useAuth } from '../../context/AuthContext'; // For isAuthenticated

const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY_MS = 3000;

interface WebSocketHookData {
  klines: Kline[];
  indicators: IndicatorData | null;
  lastMessageTimestamp: number | null; // To help trigger re-renders in chart
}

const useMarketDataWebSocket = (pairSymbol: string | null) => {
  const { isAuthenticated } = useAuth(); // Get authentication status
  const [marketData, setMarketData] = useState<WebSocketHookData>({
    klines: [],
    indicators: null,
    lastMessageTimestamp: null,
  });
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const webSocketRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef<number>(0);

  const connectWebSocket = useCallback(() => {
    if (!pairSymbol || !isAuthenticated) {
      console.log("WebSocket: Prerequisites not met (pairSymbol or !isAuthenticated). Current auth state:", isAuthenticated);
      if (webSocketRef.current && webSocketRef.current.readyState === WebSocket.OPEN) {
        webSocketRef.current.close();
      }
      setMarketData({ klines: [], indicators: null, lastMessageTimestamp: null }); // Clear data
      setIsConnected(false);
      return;
    }

    if (webSocketRef.current && webSocketRef.current.readyState === WebSocket.OPEN) {
      // If already connected to the same pair, do nothing.
      if (webSocketRef.current.url.includes(`/${pairSymbol.toLowerCase()}/`)) {
        console.log("WebSocket already connected for", pairSymbol);
        return;
      }
      // If connected to a different pair, close the old connection first
      console.log("WebSocket closing old connection to connect to new pair:", pairSymbol);
      webSocketRef.current.close();
    }

    const VITE_WS_BASE_URL = 'ws://localhost:8000/ws';
    // Ensure token is appended if your WebSocket backend requires it for auth
    // For example, if using the TokenAuthMiddleware discussed previously:
    // const token = localStorage.getItem('accessToken'); // Or wherever your token is
    // const wsUrl = `${VITE_WS_BASE_URL}/market-data/${pairSymbol.toLowerCase()}/?token=${token}`;
    const wsUrl = `${VITE_WS_BASE_URL}/market-data/${pairSymbol.toLowerCase()}/`; // Original, if no token in query

    console.log(`WebSocket: Attempting to connect to: ${wsUrl}`);
    webSocketRef.current = new WebSocket(wsUrl);

    webSocketRef.current.onopen = () => {
      console.log(`WebSocket connected for ${pairSymbol}`);
      setIsConnected(true);
      setError(null);
      reconnectAttemptsRef.current = 0;
      // Clear any stale data from previous connections
      setMarketData({ klines: [], indicators: null, lastMessageTimestamp: Date.now() });
    };

    webSocketRef.current.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data as string) as MarketDataMessage;
        console.log('WebSocket message received:', message.type, message.symbol);

        if (message.type === 'kline_with_indicators') {
          if(message.symbol.toUpperCase() === pairSymbol.toUpperCase()) { // Ensure message is for current symbol
            setMarketData({
              klines: message.klines || [], // Ensure klines is always an array
              indicators: message.indicators || null, // Ensure indicators can be null
              lastMessageTimestamp: Date.now(), // Update timestamp to trigger re-render
            });
          } else {
            console.warn(`WebSocket: Received data for ${message.symbol}, but subscribed to ${pairSymbol}. Ignoring.`);
          }
        } else if (message.type === 'error') {
          console.error('WebSocket error message from server:', message.error);
          setError(message.error || 'Unknown error from server');
        } else {
          // Handle other message types from your backend if necessary
           console.log('WebSocket: Received unhandled message type:', (message as any).type);
        }
      } catch (e) {
        console.error('WebSocket: Failed to parse message or handle it:', e, event.data);
        setError('Error processing message from server.');
      }
    };

    webSocketRef.current.onerror = (event) => {
      console.error('WebSocket error event:', event);
      setError('WebSocket connection error occurred.');
      setIsConnected(false);
    };

    webSocketRef.current.onclose = (event) => {
      console.log(`WebSocket disconnected for ${pairSymbol}. Clean: ${event.wasClean}, Code: ${event.code}, Reason: '${event.reason}'`);
      setIsConnected(false);
      // Do not attempt to reconnect if the closure was intentional (e.g., user logged out, changed pair)
      // or if the closure was clean (code 1000) unless specifically desired.
      // The current logic in useEffect will handle explicit disconnects/reconnects on pairSymbol/auth change.
      if (!event.wasClean && event.code !== 1000 && reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttemptsRef.current += 1;
        console.log(`WebSocket: Attempting to reconnect (${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS})...`);
        setTimeout(connectWebSocket, RECONNECT_DELAY_MS);
      } else if (!event.wasClean && event.code !== 1000) {
        const reconError = `Failed to reconnect to WebSocket for ${pairSymbol} after ${MAX_RECONNECT_ATTEMPTS} attempts.`;
        setError(reconError);
        console.error(reconError);
      }
    };
  }, [pairSymbol, isAuthenticated]); // isAuthenticated is crucial here

  useEffect(() => {
    if (pairSymbol && isAuthenticated) {
      connectWebSocket();
    } else {
      if (webSocketRef.current) {
        console.log("WebSocket: Closing due to no pairSymbol or !isAuthenticated.");
        webSocketRef.current.onclose = null; // Prevent onclose handler from trying to reconnect
        webSocketRef.current.close(1000, "Client initiated disconnect"); // Clean disconnect
        webSocketRef.current = null;
      }
      setMarketData({ klines: [], indicators: null, lastMessageTimestamp: null }); // Clear data
      setIsConnected(false);
    }

    return () => {
      if (webSocketRef.current) {
        console.log(`WebSocket: Cleaning up connection for ${pairSymbol || 'N/A'}.`);
        webSocketRef.current.onclose = null; // Important to prevent reconnect logic on unmount
        webSocketRef.current.close(1000, "Component unmounting"); // Clean disconnect
        webSocketRef.current = null;
      }
    };
  }, [pairSymbol, isAuthenticated, connectWebSocket]);

  const sendMessage = useCallback((message: object) => { // Kept if direct messaging needed
    if (webSocketRef.current && webSocketRef.current.readyState === WebSocket.OPEN) {
      webSocketRef.current.send(JSON.stringify(message));
    } else {
      console.warn('WebSocket is not connected. Cannot send message.');
    }
  }, []);

  return {
    klines: marketData.klines,
    indicators: marketData.indicators,
    lastMessageTimestamp: marketData.lastMessageTimestamp,
    isConnected,
    error,
    sendMessage
  };
};

export default useMarketDataWebSocket;