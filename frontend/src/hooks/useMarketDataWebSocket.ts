import {useState, useEffect, useRef, useCallback} from 'react';
import {Kline, IndicatorData, MarketDataMessage} from '../types/marketData';
import {useAuth} from '../../context/AuthContext';

const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY_MS = 3000;

interface WebSocketHookData {
    klines: Kline[];
    indicators: IndicatorData | null;
    lastMessageTimestamp: number | null;
}

// Added interval to the hook's parameters
const useMarketDataWebSocket = (pairSymbol: string | null, interval: string | null) => {
    const {isAuthenticated} = useAuth();
    const [marketData, setMarketData] = useState<WebSocketHookData>({
        klines: [],
        indicators: null,
        lastMessageTimestamp: null,
    });
    const [isConnected, setIsConnected] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const webSocketRef = useRef<WebSocket | null>(null);
    const reconnectAttemptsRef = useRef<number>(0);

    const sendMessage = useCallback((message: object) => {
        if (webSocketRef.current && webSocketRef.current.readyState === WebSocket.OPEN) {
            webSocketRef.current.send(JSON.stringify(message));
        } else {
            console.warn('WebSocket is not connected. Cannot send message.');
        }
    }, []);

    const connectWebSocket = useCallback(() => {
        if (!pairSymbol || !isAuthenticated || !interval) {
            console.log("WebSocket: Prerequisites not met (pairSymbol, interval, or !isAuthenticated). Current auth state:", isAuthenticated, "Pair:", pairSymbol, "Interval:", interval);
            if (webSocketRef.current && webSocketRef.current.readyState === WebSocket.OPEN) {
                webSocketRef.current.close();
            }
            setMarketData({klines: [], indicators: null, lastMessageTimestamp: null});
            setIsConnected(false);
            return;
        }

        const currentWsUrl = webSocketRef.current?.url;
        const newWsUrlPath = `/market-data/${pairSymbol.toLowerCase()}/`;

        if (webSocketRef.current && webSocketRef.current.readyState === WebSocket.OPEN) {
            if (currentWsUrl && currentWsUrl.includes(newWsUrlPath)) {
                // If connected to the same pair, but interval might have changed,
                // we can send a new subscription message without full reconnect.
                // However, if interval change requires full reset, a full reconnect is fine too.
                // For now, if pair is same, assume interval update will be handled by sending subscribe_kline.
                console.log("WebSocket already connected for", pairSymbol, "checking interval.");
                sendMessage({
                    type: 'subscribe_kline',
                    payload: {interval: interval},
                });
                return; // Already connected, just sent subscription update
            }
            console.log("WebSocket closing old connection to connect to new pair/url:", pairSymbol);
            webSocketRef.current.close();
        }

        const VITE_WS_BASE_URL = 'ws://localhost:8000/ws';
        const wsUrl = `${VITE_WS_BASE_URL}/market-data/${pairSymbol.toLowerCase()}/`;

        console.log(`WebSocket: Attempting to connect to: ${wsUrl}`);
        webSocketRef.current = new WebSocket(wsUrl);

        webSocketRef.current.onopen = () => {
            console.log(`WebSocket connected for ${pairSymbol} with interval ${interval}`);
            setIsConnected(true);
            setError(null);
            reconnectAttemptsRef.current = 0;
            setMarketData({klines: [], indicators: null, lastMessageTimestamp: Date.now()});

            // Send subscription message for klines with the specified interval
            sendMessage({
                type: 'subscribe_kline',
                payload: {interval: interval},
            });
        };

        webSocketRef.current.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data as string) as MarketDataMessage;
                console.log('WebSocket message received:', message.type, message.symbol, message.interval);

                if (message.type === 'kline_with_indicators') {
                    if (message.symbol && message.symbol.toUpperCase() === pairSymbol?.toUpperCase() &&
                        message.interval && message.interval === interval) { // `interval` тут - це `activeInterval` з DashboardPage
                        setMarketData({
                            klines: message.klines || [],
                            indicators: message.indicators || null,
                            lastMessageTimestamp: Date.now(),
                        });
                    } else {
                        console.log(`WebSocket: Ignoring data for <span class="math-inline">\{message\.symbol\}@</span>{message.interval} (expected <span class="math-inline">\{pairSymbol\}@</span>{interval})`);
                    }
                } else if (message.type === 'error') {
                    console.error('WebSocket error message from server:', message.error);
                    setError(message.error || 'Unknown error from server');
                } else if (message.type === 'subscription_ack') {
                    console.log('WebSocket subscription acknowledged by server:', message);
                } else if (message.type === 'connection_established') {
                    console.log('WebSocket connection established message from server:', message);
                } else if (message.type === 'pong') {
                    console.log('WebSocket pong received from server.');
                } else {
                    console.log('WebSocket: Received unhandled message type:', (message as any).type, message);
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
    }, [pairSymbol, isAuthenticated, interval, sendMessage]); // Added interval and sendMessage

    useEffect(() => {
        if (pairSymbol && isAuthenticated && interval) { // Added interval check
            connectWebSocket();
        } else {
            if (webSocketRef.current) {
                console.log("WebSocket: Closing due to no pairSymbol, interval, or !isAuthenticated.");
                webSocketRef.current.onclose = null;
                webSocketRef.current.close(1000, "Client initiated disconnect");
                webSocketRef.current = null;
            }
            setMarketData({klines: [], indicators: null, lastMessageTimestamp: null});
            setIsConnected(false);
        }

        return () => {
            if (webSocketRef.current) {
                console.log(`WebSocket: Cleaning up connection for ${pairSymbol || 'N/A'}.`);
                webSocketRef.current.onclose = null;
                webSocketRef.current.close(1000, "Component unmounting");
                webSocketRef.current = null;
            }
        };
    }, [pairSymbol, isAuthenticated, interval, connectWebSocket]); // Added interval

    // Expose sendMessage for other uses if needed, but internal use is primary for subscription
    return {
        klines: marketData.klines,
        indicators: marketData.indicators,
        lastMessageTimestamp: marketData.lastMessageTimestamp,
        isConnected,
        error,
        sendMessage // Exposed sendMessage
    };
};

export default useMarketDataWebSocket;