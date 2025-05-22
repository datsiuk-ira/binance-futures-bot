// frontend/src/hooks/useMarketDataWebSocket.ts
import { useState, useEffect, useRef, useCallback } from 'react';
import { MarketDataMessage, Kline, IndicatorData } from '../types/marketData';
import { getHistoricalIndicators } from '../api/marketDataService';

const WS_BASE_URL = 'ws://localhost:8000/ws';
const POLLING_INTERVAL = 30000;

interface MarketDataState {
  klines: Kline[];
  indicators: IndicatorData;
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  lastMessageTimestamp: number | null;
  isPolling: boolean;
}

const MAX_KLINES_IN_STATE = 500;

export const useMarketDataWebSocket = (symbol: string | null, interval: string | null) => {
  const [marketData, setMarketData] = useState<MarketDataState>({
    klines: [],
    indicators: { timestamps: [] },
    isConnected: false,
    isConnecting: false,
    error: null,
    lastMessageTimestamp: null,
    isPolling: false,
  });

  const webSocketRef = useRef<WebSocket | null>(null);
  // Changed NodeJS.Timeout to number
  const pollingIntervalRef = useRef<number | null>(null); // <--- FIX HERE
  const shouldAttemptReconnectRef = useRef<boolean>(true);

  const stopPolling = () => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    setMarketData(prev => ({ ...prev, isPolling: false }));
  };

  const pollData = useCallback(async () => {
    if (!symbol || !interval || !marketData.isPolling) return; // Check isPolling from state
    try {
      const data = await getHistoricalIndicators(symbol, interval, MAX_KLINES_IN_STATE);
      setMarketData(prev => ({
        ...prev,
        klines: data.klines.slice(-MAX_KLINES_IN_STATE),
        indicators: data.indicators,
        error: null,
        lastMessageTimestamp: Date.now(),
      }));
    } catch (e: any) {
      console.error('Polling error:', e);
      setMarketData(prev => ({ ...prev, error: e.message || 'Polling failed' }));
    }
  }, [symbol, interval, marketData.isPolling]); // marketData.isPolling dependency

  const startPolling = useCallback(() => { // Make startPolling a useCallback
    if (!symbol || !interval || pollingIntervalRef.current) return;
    setMarketData(prev => ({ ...prev, isPolling: true, isConnected: false, isConnecting: false }));
    pollData();
    pollingIntervalRef.current = window.setInterval(pollData, POLLING_INTERVAL); // Use window.setInterval for clarity
  }, [symbol, interval, pollData]);


  const connectWebSocket = useCallback((isManualAttempt = false) => {
    if (!symbol || !interval) {
      if (webSocketRef.current) {
        shouldAttemptReconnectRef.current = false;
        webSocketRef.current.close();
        webSocketRef.current = null;
      }
      stopPolling();
      setMarketData(prev => ({
        ...prev,
        klines: [],
        indicators: { timestamps: [] },
        isConnected: false,
        isConnecting: false,
        error: prev.error || 'Symbol or interval not selected.',
        isPolling: false,
      }));
      return;
    }

    if (webSocketRef.current && webSocketRef.current.readyState === WebSocket.OPEN) {
        if(isManualAttempt) console.log("WebSocket already open.");
        return;
    }
    if (webSocketRef.current && webSocketRef.current.readyState === WebSocket.CONNECTING) {
        if(isManualAttempt) console.log("WebSocket already connecting.");
        return;
    }

    stopPolling();
    shouldAttemptReconnectRef.current = true;

    if (webSocketRef.current) {
      webSocketRef.current.onclose = null;
      webSocketRef.current.onerror = null;
      webSocketRef.current.onmessage = null;
      webSocketRef.current.onopen = null;
      webSocketRef.current.close();
      webSocketRef.current = null;
    }

    setMarketData(prev => ({ ...prev, isConnecting: true, isConnected: false, error: null, isPolling: false }));
    const wsUrl = `${WS_BASE_URL}/marketdata/?symbol=${symbol.toUpperCase()}&interval=${interval}`;
    const ws = new WebSocket(wsUrl);
    webSocketRef.current = ws;

    ws.onopen = () => {
      console.log(`WebSocket connected for ${symbol} ${interval}`);
      shouldAttemptReconnectRef.current = true;
      stopPolling();
      setMarketData(prev => ({
        ...prev,
        isConnected: true,
        isConnecting: false,
        error: null,
        isPolling: false,
      }));
    };

    ws.onmessage = (event) => {
      try {
        const message: MarketDataMessage = JSON.parse(event.data as string);
        if (message.type === 'kline_with_indicators') {
          let updatedKlines = message.klines;
          if (updatedKlines.length > MAX_KLINES_IN_STATE) {
            updatedKlines = updatedKlines.slice(-MAX_KLINES_IN_STATE);
          }
          setMarketData(prev => ({
            ...prev,
            klines: updatedKlines,
            indicators: message.indicators,
            error: null,
            lastMessageTimestamp: Date.now(),
          }));
        } else if (message.type === 'error') {
          console.error('WebSocket error message:', message.error);
          setMarketData(prev => ({ ...prev, error: message.error || 'Unknown WebSocket error', isConnecting: false }));
        }
      } catch (e) {
        console.error('Failed to parse WebSocket message:', e);
        setMarketData(prev => ({ ...prev, error: 'Failed to process data from server.', isConnecting: false }));
      }
    };

    ws.onerror = (event) => {
      console.error('WebSocket error event:', event);
      setMarketData(prev => ({
        ...prev,
        isConnected: false,
        isConnecting: false,
        error: 'WebSocket connection error. Will attempt to fallback to polling.',
      }));
    };

    ws.onclose = (event) => {
      console.log(`WebSocket disconnected for ${symbol} ${interval}. Code: ${event.code}, Clean: ${event.wasClean}`);
      if (webSocketRef.current === ws) {
        webSocketRef.current = null; // Clear the ref since this instance is closed
        setMarketData(prev => ({
            ...prev,
            isConnected: false,
            isConnecting: false,
        }));

        if (shouldAttemptReconnectRef.current && symbol && interval) {
            console.log("WebSocket closed, falling back to API polling.");
            startPolling(); // Use the useCallback version of startPolling
        } else {
            console.log("WebSocket deliberately closed or no params, not starting polling.");
        }
      }
    };
  }, [symbol, interval, startPolling]); // Added startPolling to dependencies

  useEffect(() => {
    if (symbol && interval) {
      connectWebSocket();
    } else {
      if (webSocketRef.current) {
        shouldAttemptReconnectRef.current = false;
        webSocketRef.current.close();
        webSocketRef.current = null;
      }
      stopPolling();
      setMarketData({
        klines: [],
        indicators: { timestamps: [] },
        isConnected: false,
        isConnecting: false,
        error: null,
        lastMessageTimestamp: null,
        isPolling: false,
      });
    }

    return () => {
      shouldAttemptReconnectRef.current = false;
      if (webSocketRef.current) {
        webSocketRef.current.onclose = null;
        webSocketRef.current.onerror = null;
        webSocketRef.current.onmessage = null;
        webSocketRef.current.onopen = null;
        webSocketRef.current.close();
        webSocketRef.current = null;
      }
      stopPolling();
    };
  }, [symbol, interval, connectWebSocket]);


  const setInitialData = useCallback((data: { klines: Kline[], indicators: IndicatorData }) => {
    setMarketData(prev => ({
      ...prev,
      klines: data.klines.slice(-MAX_KLINES_IN_STATE),
      indicators: data.indicators,
      error: null,
    }));
  }, []);

  const manualConnect = () => {
    console.log("Manual connection attempt initiated.");
    shouldAttemptReconnectRef.current = true;
    connectWebSocket(true);
  };

  return { ...marketData, setInitialData, manualConnect, isPollingActive: marketData.isPolling };
};