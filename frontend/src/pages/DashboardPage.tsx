import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext'; // Using your provided AuthContext
import useMarketDataWebSocket from '../hooks/useMarketDataWebSocket';
import KlineChart from '../components/KlineChart';
import { Kline, IndicatorData } from '../types/marketData';
import { Box, Button, TextField, Typography, Paper, Grid, Alert, CircularProgress, Link as MuiLink, Container } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useNavigate, Link as RouterLink } from 'react-router-dom';

const DashboardPage: React.FC = () => {
  const { t } = useTranslation();
  // Using fields from your current AuthContextType: user, isAuthenticated, logout, loading
  const { user, isAuthenticated, logout, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [pairSymbolInput, setPairSymbolInput] = useState<string>('BTCUSDT');
  const [activePairSymbol, setActivePairSymbol] = useState<string | null>(null);

  const {
    klines,
    indicators,
    lastMessageTimestamp,
    isConnected,
    error: wsError,
  } = useMarketDataWebSocket(activePairSymbol);

  const handleConnect = () => {
    if (pairSymbolInput.trim()) {
      const newSymbol = pairSymbolInput.trim().toUpperCase();
      if (newSymbol !== activePairSymbol) {
        setActivePairSymbol(newSymbol);
      }
    }
  };

  const handleDisconnect = () => {
    setActivePairSymbol(null);
  };

  useEffect(() => {
    // Use authLoading (renamed from loading in context) to check if auth state is determined
    if (!authLoading && !isAuthenticated) {
      navigate('/login', { replace: true });
    }
  }, [isAuthenticated, authLoading, navigate]);

  const lastPrice = klines && klines.length > 0 ? klines[klines.length - 1].close : null;

  // Show loading spinner if authentication is in progress
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
            {/* Display username if user object is available */}
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

        <Grid container spacing={2} alignItems="center" sx={{ mb: 3 }}>
            <TextField
              fullWidth
              label={t('dashboardPage.label.pairSymbol')}
              value={pairSymbolInput}
              onChange={(e) => setPairSymbolInput(e.target.value)}
              variant="outlined"
              disabled={isConnected}
            />
            {!isConnected ? (
              <Button fullWidth variant="contained" color="primary" onClick={handleConnect} disabled={!pairSymbolInput.trim() || isConnected}>
                {activePairSymbol && !isConnected && !wsError ? <CircularProgress size={24} color="inherit" /> : t('dashboardPage.button.connect')}
              </Button>
            ) : (
              <Button fullWidth variant="contained" color="secondary" onClick={handleDisconnect}>
                {t('dashboardPage.button.disconnect')}
              </Button>
            )}
            <Typography variant="subtitle1">
              {isConnected && activePairSymbol
                ? `${t('dashboardPage.status.connectedTo')} ${activePairSymbol}`
                : t('dashboardPage.status.disconnected')}
            </Typography>
            {lastPrice !== null && isConnected && (
              <Typography variant="subtitle1">
                {t('dashboardPage.label.lastPrice')}: {lastPrice}
              </Typography>
            )}
          </Grid>

        {wsError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {t('dashboardPage.error.websocket')}: {wsError}
          </Alert>
        )}

        <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
          {t('dashboardPage.chart.title')} {activePairSymbol ? `(${activePairSymbol})` : ''}
        </Typography>
        <Box sx={{ height: 500, width: '100%', backgroundColor: '#f9f9f9', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
          {activePairSymbol && isConnected && klines && indicators ? (
            <KlineChart
              key={activePairSymbol + "_" + lastMessageTimestamp}
              klines={klines}
              indicators={indicators}
              symbol={activePairSymbol}
            />
          ) : (
            <Typography>
              {activePairSymbol && !wsError ? t('dashboardPage.status.connecting') : t('dashboardPage.label.noData')}
            </Typography>
          )}
          {activePairSymbol && !isConnected && !wsError && (
             <CircularProgress sx={{position: 'absolute'}}/>
          )}
        </Box>
      </Paper>
    </Container>
  );
};

export default DashboardPage;