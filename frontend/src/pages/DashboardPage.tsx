// frontend/src/pages/DashboardPage.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Container, Typography, Box, CircularProgress, Alert, Select, MenuItem, FormControl, InputLabel, Grid, SelectChangeEvent, Button } from '@mui/material'; // Added Button
import KlineChart from '../components/KlineChart';
import { useMarketDataWebSocket } from '../hooks/useMarketDataWebSocket';
import { getHistoricalIndicators } from '../api/marketDataService';
import { IndicatorData, Kline } from '../types/marketData';

const AVAILABLE_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT'];
const AVAILABLE_INTERVALS = ['1m', '5m', '15m', '30m', '1h', '4h', '1d'];

const DashboardPage: React.FC = () => {
  const { t } = useTranslation();
  const [selectedSymbol, setSelectedSymbol] = useState<string>('BTCUSDT');
  const [selectedInterval, setSelectedInterval] = useState<string>('1m');
  const [isLoadingInitialData, setIsLoadingInitialData] = useState<boolean>(false);
  const [initialDataError, setInitialDataError] = useState<string | null>(null);

  const {
    klines: wsKlines,
    indicators: wsIndicators,
    isConnected,
    isConnecting, // New state from hook
    error: wsError,
    setInitialData,
    manualConnect, // New function from hook
    isPollingActive // New state from hook
  } = useMarketDataWebSocket(selectedSymbol, selectedInterval);

  const [chartKlines, setChartKlines] = useState<Kline[]>([]);
  const [chartIndicators, setChartIndicators] = useState<IndicatorData>({ timestamps: [] });

  const fetchAndSetInitialData = useCallback(async (symbol: string, interval: string) => {
    if (!symbol || !interval) return;

    setIsLoadingInitialData(true);
    setInitialDataError(null);
    try {
      const historicalData = await getHistoricalIndicators(symbol, interval, 500);
      setInitialData({ klines: historicalData.klines, indicators: historicalData.indicators });
      setChartKlines(historicalData.klines);
      setChartIndicators(historicalData.indicators);
    } catch (error: any) {
      console.error('Failed to fetch initial chart data:', error);
      const errorMessage = error?.response?.data?.error || error?.message || 'Failed to load historical data.';
      setInitialDataError(errorMessage);
      setChartKlines([]);
      setChartIndicators({ timestamps: [] });
    } finally {
      setIsLoadingInitialData(false);
    }
  }, [setInitialData]);

  useEffect(() => {
    if (selectedSymbol && selectedInterval) {
      setChartKlines([]);
      setChartIndicators({ timestamps: [] });
      fetchAndSetInitialData(selectedSymbol, selectedInterval);
      // The hook will attempt to connect WebSocket based on selectedSymbol & selectedInterval
    } else {
      setChartKlines([]);
      setChartIndicators({ timestamps: [] });
    }
  }, [selectedSymbol, selectedInterval, fetchAndSetInitialData]);

  useEffect(() => {
    // This effect ensures that chart data updates whenever wsKlines or wsIndicators change,
    // which can happen due to WebSocket messages or API polling updates via the hook.
    if (wsKlines.length > 0 || isPollingActive) { // Update if we have WS klines OR if polling is active (which might also provide klines)
        setChartKlines(wsKlines); // wsKlines from the hook will reflect either WS data or polled data
        setChartIndicators(wsIndicators);
    } else if (!isConnected && !isConnecting && !isPollingActive && wsKlines.length === 0) {
        // If not connected, not attempting to connect, not polling, and no data, clear chart
        // This can happen if symbol/interval are cleared or an unrecoverable error occurs.
        // setChartKlines([]);
        // setChartIndicators({ timestamps: [] });
        // Initial data fetch will handle this better. This condition might be too aggressive.
    }
  }, [wsKlines, wsIndicators, isConnected, isConnecting, isPollingActive]);

  const handleSymbolChange = (event: SelectChangeEvent<string>) => {
    setSelectedSymbol(event.target.value as string);
  };

  const handleIntervalChange = (event: SelectChangeEvent<string>) => {
    setSelectedInterval(event.target.value as string);
  };

  const getStatusMessage = () => {
    if (isConnecting) return <span style={{ color: 'orange' }}>{t('dashboard.connecting', 'Connecting...')}</span>;
    if (isConnected) return <span style={{ color: 'green' }}>{t('dashboard.connected', 'Connected to WebSocket')}</span>;
    if (isPollingActive) return <span style={{ color: 'blue' }}>{t('dashboard.polling', 'Polling API for updates...')}</span>;
    return <span style={{ color: 'red' }}>{t('dashboard.disconnected', 'Disconnected')}</span>;
  };

  return (
    <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        {t('dashboard.title', 'Trading Dashboard')}
      </Typography>

      <Grid container spacing={2} sx={{ mb: 2, alignItems: 'center' }}>
          <FormControl fullWidth>
            <InputLabel id="symbol-select-label">{t('dashboard.symbol', 'Symbol')}</InputLabel>
            <Select
              labelId="symbol-select-label"
              value={selectedSymbol}
              label={t('dashboard.symbol', 'Symbol')}
              onChange={handleSymbolChange}
            >
              {AVAILABLE_SYMBOLS.map((s) => (
                <MenuItem key={s} value={s}>
                  {s}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl fullWidth>
            <InputLabel id="interval-select-label">{t('dashboard.interval', 'Interval')}</InputLabel>
            <Select
              labelId="interval-select-label"
              value={selectedInterval}
              label={t('dashboard.interval', 'Interval')}
              onChange={handleIntervalChange}
            >
              {AVAILABLE_INTERVALS.map((i) => (
                <MenuItem key={i} value={i}>
                  {i}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
            {!isConnected && !isConnecting && (
                <Button variant="outlined" onClick={manualConnect} disabled={isConnecting || !selectedSymbol || !selectedInterval}>
                    {t('dashboard.reconnectWs', 'Reconnect WebSocket')}
                </Button>
            )}

      <Box sx={{ mb: 2 }}>
        <Typography variant="subtitle1">
          {t('dashboard.status', 'Status')}: {getStatusMessage()}
        </Typography>
        {wsError && !isPollingActive && <Alert severity="warning" sx={{ mt: 1 }}>{t('dashboard.websocketError', 'WebSocket Error (will try polling)')}: {wsError}</Alert>}
        {initialDataError && !isLoadingInitialData && <Alert severity="error" sx={{ mt: 1 }}>{initialDataError}</Alert>}
      </Box>

      <Box sx={{ height: 'auto', minHeight: '500px', border: '1px solid #ddd', p: 1, position: 'relative' }}>
        {isLoadingInitialData && (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.7)', zIndex: 10 }}>
            <CircularProgress />
            <Typography sx={{ ml: 2 }}>{t('dashboard.loadingChartData', 'Loading chart data...')}</Typography>
          </Box>
        )}

        {selectedSymbol && selectedInterval ? (
            (chartKlines.length > 0 || !isLoadingInitialData || isPollingActive) ?
                <KlineChart
                    klines={chartKlines}
                    indicators={chartIndicators}
                    symbol={selectedSymbol}
                />
            : !isLoadingInitialData && <Typography>{t('dashboard.noDataForChart', 'No data available or still loading.')}</Typography>
        ) : (
            <Typography>{t('dashboard.selectSymbolInterval', 'Please select a symbol and interval.')}</Typography>
        )}
      </Box>
    </Container>
  );
};

export default DashboardPage;