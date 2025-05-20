import React, {useEffect, useState, useCallback, useRef} from 'react';
import {useTranslation} from 'react-i18next';
import {
    Box,
    Paper,
    Typography,
    TextField,
    Button,
    CircularProgress,
    Alert,
    Select,
    MenuItem
} from '@mui/material';
import Grid from '@mui/material/Grid';
import {SelectChangeEvent} from '@mui/material/Select';
import {useAuth} from '../../context/AuthContext'; // Adjust path as needed
import {fetchMarketKlines, KlineData} from '../api/marketDataService'; // Adjust path as needed
import KlineChart from '../components/KlineChart'; // Adjust path as needed
import {CandlestickData, UTCTimestamp} from 'lightweight-charts';
import {KlineData as HistoricalKlineData} from '../api/marketDataService';


// Structure from WebSocket (backend should send this)
interface RealtimeKlineUpdateMessage {
    time: number; // UTCTimestamp in seconds
    open: number;
    high: number;
    low: number;
    close: number;
    isClosed?: boolean;
    symbol?: string;
    interval?: string;
}

const DashboardPage: React.FC = () => {
    const {t} = useTranslation('common');
    const {isAuthenticated} = useAuth();

    // Historical data fetched via REST API
    const [historicalData, setHistoricalData] = useState<HistoricalKlineData[]>([]);
    // Last candle update received via WebSocket
    const [lastCandleWebSocketUpdate, setLastCandleWebSocketUpdate] = useState<CandlestickData | null>(null);

    const [loadingHistorical, setLoadingHistorical] = useState<boolean>(true);
    const [fetchError, setFetchError] = useState<string | null>(null);

    const [symbol, setSymbol] = useState<string>('BTCUSDT');
    const [interval, setInterval] = useState<string>('1m');
    const [limit, setLimit] = useState<number>(200); // Fetch more historical data

    const availableIntervals = ['1m', '5m', '15m', '30m', '1h', '2h', '4h', '1d'];
    const socketRef = useRef<WebSocket | null>(null);

    const loadHistoricalData = useCallback(async (currentSymbol: string, currentInterval: string, currentLimit: number) => {
        if (!isAuthenticated) {
            setFetchError(t('dashboardPage.loginRequired'));
            setLoadingHistorical(false);
            return;
        }
        console.log(`Workspaceing historical data for ${currentSymbol}, ${currentInterval}, limit ${currentLimit}`);
        setLoadingHistorical(true);
        setFetchError(null);
        setLastCandleWebSocketUpdate(null); // Clear WS update when refetching historical
        try {
            const data = await fetchMarketKlines({
                symbol: currentSymbol,
                interval: currentInterval,
                limit: currentLimit,
            });
            setHistoricalData(data);
            console.log(`Workspaceed ${data.length} historical klines.`);
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : t('dashboardPage.unknownError');
            setFetchError(`${t('dashboardPage.fetchErrorPrefix')}: ${errorMessage}`);
            console.error("Error fetching historical data:", err);
            setHistoricalData([]); // Clear data on error
        } finally {
            setLoadingHistorical(false);
        }
    }, [isAuthenticated, t]);

    useEffect(() => {
        loadHistoricalData(symbol, interval, limit);
    }, [symbol, interval, limit, loadHistoricalData]); // Initial load and on param change

    useEffect(() => {
        if (!symbol || !interval || !isAuthenticated) {
            if (socketRef.current) {
                console.log("Closing WebSocket due to params/auth change or not authenticated.");
                socketRef.current.close();
                socketRef.current = null;
            }
            return;
        }

        if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
            // If parameters change, we want to close the old socket and open a new one.
            // Check if the URL would be different
            const oldUrl = socketRef.current.url;
            const wsScheme = window.location.protocol === "https:" ? "wss" : "ws";
            const newWsPath = `<span class="math-inline">\{wsScheme\}\://</span>{window.location.host}/ws/klines/<span class="math-inline">\{symbol\.toUpperCase\(\)\}\_</span>{interval.toLowerCase()}/`;
            if (oldUrl === newWsPath) { // Or some other way to check if it's for the same stream
                console.log("WebSocket already connected for the same parameters.");
                return;
            }
            console.log("Parameters changed, closing old WebSocket.");
            socketRef.current.close();
        }

        const wsScheme = window.location.protocol === "https:" ? "wss" : "ws";
        const wsPath = `<span class="math-inline">\{wsScheme\}\://</span>{window.location.host}/ws/klines/<span class="math-inline">\{symbol\.toUpperCase\(\)\}\_</span>{interval.toLowerCase()}/`;

        console.log(`Attempting to connect to WebSocket: ${wsPath}`);
        const newSocket = new WebSocket(wsPath);
        socketRef.current = newSocket;

        newSocket.onopen = () => {
            console.log(`WebSocket connection established for <span class="math-inline">\{symbol\}\_</span>{interval}`);
        };

        newSocket.onmessage = (event) => {
            try {
                const message: RealtimeKlineUpdateMessage = JSON.parse(event.data as string);
                // console.log("WebSocket message received:", message);

                if (message && typeof message.time === 'number') {
                    const candleUpdate: CandlestickData = {
                        time: message.time as UTCTimestamp, // Backend should send time in seconds
                        open: message.open,
                        high: message.high,
                        low: message.low,
                        close: message.close,
                    };
                    setLastCandleWebSocketUpdate(candleUpdate);
                } else {
                    console.warn("Received WebSocket message in unexpected format:", message);
                }
            } catch (e) {
                console.error("Error processing WebSocket message:", e);
            }
        };

        newSocket.onclose = (event) => {
            console.log(`WebSocket connection closed for <span class="math-inline">\{symbol\}\_</span>{interval}:`, event.reason, `Code: ${event.code}`);
            if (socketRef.current === newSocket) { // Avoid issues if a new socket was created quickly
                socketRef.current = null;
            }
        };

        newSocket.onerror = (error) => {
            console.error(`WebSocket error for <span class="math-inline">\{symbol\}\_</span>{interval}:`, error);
        };

        return () => {
            console.log(`Cleanup: Closing WebSocket for <span class="math-inline">\{symbol\}\_</span>{interval}`);
            if (newSocket.readyState === WebSocket.OPEN || newSocket.readyState === WebSocket.CONNECTING) {
                newSocket.close();
            }
            if (socketRef.current === newSocket) {
                socketRef.current = null;
            }
        };
    }, [symbol, interval, isAuthenticated]); // Dependencies for WebSocket connection

    const handleFetchClick = () => {
        loadHistoricalData(symbol, interval, limit);
    };

    if (!isAuthenticated && !loadingHistorical) {
        return <Alert severity="warning">{t('dashboardPage.loginRequired')}</Alert>;
    }

    return (
        <Paper elevation={3} sx={{padding: {xs: 1, sm: 2, md: 3}, marginTop: 2}}>
            <Typography variant="h4" gutterBottom component="h1">
                {t('dashboardPage.title', 'Testnet')}
            </Typography>

            <Grid container spacing={2} sx={{marginBottom: 2, alignItems: 'center'}}>
                <TextField
                    label={t('dashboardPage.symbolLabel')}
                    value={symbol}
                    onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                    variant="outlined"
                    size="small"
                    fullWidth
                />
                <Select
                    value={interval}
                    onChange={(e: SelectChangeEvent) => setInterval(e.target.value as string)}
                    size="small"
                    fullWidth
                    displayEmpty
                >
                    <MenuItem value="" disabled>{t('dashboardPage.intervalLabel')}</MenuItem>
                    {availableIntervals.map(opt => (
                        <MenuItem key={opt} value={opt}>{opt}</MenuItem>
                    ))}
                </Select>
                <TextField
                    label={t('dashboardPage.limitLabel')}
                    type="number"
                    value={limit}
                    onChange={(e) => setLimit(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    variant="outlined"
                    size="small"
                    inputProps={{min: 1, max: 1500}}
                    fullWidth
                />
                <Button variant="contained" onClick={handleFetchClick} disabled={loadingHistorical} fullWidth>
                    {loadingHistorical && historicalData.length === 0 ?
                        <CircularProgress size={24}/> : t('dashboardPage.updateButton')}
                </Button>
            </Grid>

            {loadingHistorical && historicalData.length === 0 && (
                <Box sx={{display: 'flex', justifyContent: 'center', my: 3}}><CircularProgress/></Box>
            )}

            {fetchError && <Alert severity="error" sx={{my: 2}}>{fetchError}</Alert>}

            <Box sx={{marginTop: 3, minHeight: '450px'}}>
                <KlineChart
                    data={historicalData}
                    lastCandleUpdate={lastCandleWebSocketUpdate}
                    height={500}
                />
            </Box>

            {!loadingHistorical && historicalData.length === 0 && !fetchError && (
                <Alert severity="info" sx={{marginTop: 2}}>{t('dashboardPage.noDataForSymbol')}</Alert>
            )}
        </Paper>
    );
};

export default DashboardPage;
