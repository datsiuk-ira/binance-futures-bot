import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import useMarketDataWebSocket from '../hooks/useMarketDataWebSocket';
import KlineChart from '../components/KlineChart';
import { Kline, IndicatorData } from '../types/marketData';
import { Box, Button, TextField, Typography, Paper, Alert, CircularProgress, Link as MuiLink, Container, Select, MenuItem, FormControl, InputLabel, SelectChangeEvent } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useNavigate, Link as RouterLink } from 'react-router-dom';

const availableIntervals = ['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '8h', '12h', '1d', '3d', '1w'];

const DashboardPage: React.FC = () => {
  const { t } = useTranslation();
  const { user, isAuthenticated, logout, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [pairSymbolInput, setPairSymbolInput] = useState<string>('BTCUSDT');
  const [activePairSymbol, setActivePairSymbol] = useState<string | null>(null);

  const [intervalInput, setIntervalInput] = useState<string>('1m'); // Default interval
  const [activeInterval, setActiveInterval] = useState<string | null>(null);

  const {
    klines,
    indicators,
    lastMessageTimestamp,
    isConnected,
    error: wsError,
    // sendMessage, // Can be used if needed to send other messages post-connection
  } = useMarketDataWebSocket(activePairSymbol, activeInterval);

  const handleConnect = () => {
    if (pairSymbolInput.trim() && intervalInput) {
      const newSymbol = pairSymbolInput.trim().toUpperCase();
      // setActivePairSymbol(null); // Force re-render of hook if symbol changes
      // setActiveInterval(null);
      // setTimeout(() => { // Allow state to clear before setting new values
        setActivePairSymbol(newSymbol);
        setActiveInterval(intervalInput);
      // }, 0);
    }
  };

  const handleDisconnect = () => {
    setActivePairSymbol(null);
    setActiveInterval(null); // Also clear active interval
  };

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate('/login', { replace: true });
    }
  }, [isAuthenticated, authLoading, navigate]);

  const lastPrice = klines && klines.length > 0 ? klines[klines.length - 1].close : null;

  if (authLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Paper sx={{ p: 3, display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography component="h1" variant="h5">
            {t('dashboardPage.title')}
            {user ? ` - Welcome, ${user.username}` : ''}
          </Typography>
          <Box>
            <MuiLink component={RouterLink} to="/profile" sx={{ mr: 2 }}>
              {t('dashboardPage.link.profile')}
            </MuiLink>
            <Button variant="outlined" onClick={async () => { await logout(); navigate('/login'); }}>
              {t('dashboardPage.button.logout')}
            </Button>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 3 }}>
          <TextField
            fullWidth
            label={t('dashboardPage.label.pairSymbol')}
            value={pairSymbolInput}
            onChange={(e) => setPairSymbolInput(e.target.value)}
            variant="outlined"
            disabled={isConnected}
            sx={{ flexGrow: 1 }}
          />
          <FormControl fullWidth disabled={isConnected} sx={{ flexGrow: 1 }}>
            <InputLabel id="interval-select-label">{t('dashboardPage.label.interval')}</InputLabel>
            <Select
              labelId="interval-select-label"
              value={intervalInput}
              label={t('dashboardPage.label.interval')}
              onChange={(e: SelectChangeEvent<string>) => setIntervalInput(e.target.value)}
            >
              {availableIntervals.map(int => (
                <MenuItem key={int} value={int}>{int}</MenuItem>
              ))}
            </Select>
          </FormControl>

          {!isConnected ? (
            <Button
              fullWidth
              variant="contained"
              color="primary"
              onClick={handleConnect}
              disabled={!pairSymbolInput.trim() || !intervalInput || (isConnected && activePairSymbol === pairSymbolInput.trim().toUpperCase() && activeInterval === intervalInput)}
            >
              {(activePairSymbol && activeInterval && !isConnected && !wsError) ? <CircularProgress size={24} color="inherit" /> : t('dashboardPage.button.connect')}
            </Button>
          ) : (
            <Button fullWidth variant="contained" color="secondary" onClick={handleDisconnect}>
              {t('dashboardPage.button.disconnect')}
            </Button>
          )}
        </Box>

        <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle1" component="div">
            {isConnected && activePairSymbol && activeInterval
                ? `${t('dashboardPage.status.connectedTo')} ${activePairSymbol} (${activeInterval})`
                : t('dashboardPage.status.disconnected')}
            </Typography>
            {lastPrice !== null && isConnected && (
            <Typography variant="subtitle1" component="div">
                {t('dashboardPage.label.lastPrice')}: {lastPrice}
            </Typography>
            )}
        </Box>


        {wsError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {t('dashboardPage.error.websocket')}: {wsError}
          </Alert>
        )}

        <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
          {t('dashboardPage.chart.title')} {activePairSymbol && activeInterval ? `(${activePairSymbol} - ${activeInterval})` : ''}
        </Typography>
        <Box sx={{ height: 500, width: '100%', backgroundColor: '#f9f9f9', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
          {activePairSymbol && activeInterval && isConnected && klines && indicators ? (
            <KlineChart
              key={activePairSymbol + "_" + activeInterval + "_" + lastMessageTimestamp} // Ensure re-render on critical changes
              klines={klines}
              indicators={indicators}
              symbol={activePairSymbol} // Symbol is used for context in chart perhaps, but data drives it
            />
          ) : (
            <Typography>
              {activePairSymbol && activeInterval && !wsError && !isConnected ? t('dashboardPage.status.connecting') : t('dashboardPage.label.noData')}
            </Typography>
          )}
          {activePairSymbol && activeInterval && !isConnected && !wsError && (
             <CircularProgress sx={{position: 'absolute'}}/>
          )}
        </Box>
      </Paper>
    </Container>
  );
};

export default DashboardPage;