// frontend/src/pages/DashboardPage.tsx
import React, { useState, useEffect, useCallback } from 'react';
import {
  Container, Paper, Typography, Box, Switch, FormControlLabel, Select, MenuItem, InputLabel,
  FormControl, Button, TextField, CircularProgress, Alert, Tooltip, SelectChangeEvent, Theme, FormGroup
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import KlineChart from '../components/KlineChart'; // Assuming KlineChart is in src/components
import { CandlestickData, LineData, HistogramData, UTCTimestamp, Time } from 'lightweight-charts';
import { fetchMarketKlines, KlineData as ApiKlineData, FetchMarketDataParams } from '../api/marketDataService'; // Assuming this is in src/api
import { useTranslation } from 'react-i18next';

// --- Indicator calculation functions (already provided by user, assuming they are correct) ---
const generateSimpleMovingAverage = (baseData: CandlestickData[], valueField: keyof CandlestickData = 'close', period: number = 14): LineData[] => {
  if (!baseData || baseData.length < period) return [];
  const result: LineData[] = [];
  for (let i = period - 1; i < baseData.length; i++) {
    const slice = baseData.slice(i - period + 1, i + 1);
    const sum = slice.reduce((acc, val) => acc + (val[valueField] as number), 0);
    result.push({ time: baseData[i].time, value: sum / period });
  }
  return result;
};

const calculateEMA = (data: number[], period: number): number[] => {
    if (data.length < period) return [];
    const k = 2 / (period + 1);
    const emaArray = new Array(data.length).fill(0);
    if (data.length === 0) return [];
    let sum = 0;
    const initialPeriod = Math.min(period, data.length);
    for (let i = 0; i < initialPeriod; i++) {
        sum += data[i];
    }
    if (initialPeriod === 0) return [];
    emaArray[initialPeriod - 1] = sum / initialPeriod;

    for (let i = initialPeriod; i < data.length; i++) {
        emaArray[i] = (data[i] * k) + (emaArray[i - 1] * (1 - k));
    }
    return emaArray.slice(initialPeriod-1);
};

const generateMACDData = (baseData: CandlestickData[], currentTheme: Theme): { line: LineData[], signal: LineData[], hist: HistogramData[] } => {
    const shortTerm = 12;
    const longTerm = 26;
    const signalPeriod = 9;

    if (!baseData || baseData.length < longTerm) return { line: [], signal: [], hist: [] };
    const closes = baseData.map(d => d.close);
    const times = baseData.map(d => d.time);

    const ema12Values = calculateEMA(closes, shortTerm);
    const ema26Values = calculateEMA(closes, longTerm);

    const macdLineRaw: number[] = [];
    const offset12 = shortTerm - 1;
    const offset26 = longTerm - 1;
    const commonStartIndex = offset26;
    const numMacdPoints = closes.length - commonStartIndex;

    if (numMacdPoints <= 0) return { line: [], signal: [], hist: [] };

    for (let i = 0; i < numMacdPoints; i++) {
        const val12 = ema12Values[i + (offset26 - offset12)];
        const val26 = ema26Values[i];

        if (val12 !== undefined && val26 !== undefined) {
             macdLineRaw.push(val12 - val26);
        } else {
            return { line: [], signal: [], hist: [] };
        }
    }

    if (macdLineRaw.length < signalPeriod) return { line: [], signal: [], hist: [] };

    const signalLineRaw = calculateEMA(macdLineRaw, signalPeriod);

    const macdLine: LineData[] = [];
    const macdSignal: LineData[] = [];
    const macdHist: HistogramData[] = [];

    const signalTimeStartIndexInOriginal = commonStartIndex + (signalPeriod - 1);
    const numSignalPoints = signalLineRaw.length;

    for (let i = 0; i < numSignalPoints; i++) {
        const originalDataIndexForTime = signalTimeStartIndexInOriginal + i;
        if (originalDataIndexForTime >= times.length) break;

        const time = times[originalDataIndexForTime];
        const macdVal = macdLineRaw[i + (signalPeriod - 1)];
        const signalVal = signalLineRaw[i];
        const histVal = macdVal - signalVal;

        if (time !== undefined && macdVal !== undefined && signalVal !== undefined) {
            macdLine.push({ time, value: macdVal });
            macdSignal.push({ time, value: signalVal });
            macdHist.push({ time, value: histVal, color: histVal >= 0 ? currentTheme.palette.success.light : currentTheme.palette.error.light });
        }
    }
    return { line: macdLine, signal: macdSignal, hist: macdHist };
};


const generateBollingerBands = (baseData: CandlestickData[], period: number = 20, stdDevMultiplier: number = 2) => {
  if (!baseData || baseData.length < period) return { upper: [], middle: [], lower: [] };
  const middle: LineData[] = [];
  const upper: LineData[] = [];
  const lower: LineData[] = [];
  for (let i = period - 1; i < baseData.length; i++) {
    const slice = baseData.slice(i - period + 1, i + 1);
    const closes = slice.map(d => d.close);
    const sma = closes.reduce((sum, val) => sum + val, 0) / period;
    const variance = closes.reduce((sum, val) => sum + Math.pow(val - sma, 2), 0) / period;
    const stdDev = Math.sqrt(variance);
    const currentTime = baseData[i].time;
    middle.push({ time: currentTime, value: sma });
    upper.push({ time: currentTime, value: sma + stdDev * stdDevMultiplier });
    lower.push({ time: currentTime, value: sma - stdDev * stdDevMultiplier });
  }
  return { upper, middle, lower };
};

interface TradeProposal {
  id: string;
  pair: string;
  timeframe: string;
  signal: 'BUY' | 'SELL' | 'HOLD';
  entryPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  reason: string;
}

const DashboardPage: React.FC = () => {
  const { t } = useTranslation();
  const muiTheme = useTheme();

  const [klineData, setKlineData] = useState<CandlestickData[]>([]);
  const [symbol, setSymbol] = useState<string>('BTCUSDT');
  const [selectedInterval, setSelectedInterval] = useState<string>('1h');
  const [limit, setLimit] = useState<number>(300);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [rsiData, setRsiData] = useState<LineData[]>([]);
  const [ema9Data, setEma9Data] = useState<LineData[]>([]);
  const [ema21Data, setEma21Data] = useState<LineData[]>([]);
  const [ema50Data, setEma50Data] = useState<LineData[]>([]);
  const [ema200Data, setEma200Data] = useState<LineData[]>([]);
  const [macdData, setMacdData] = useState<{line: LineData[], signal: LineData[], hist: HistogramData[]}>({line: [], signal: [], hist: []});
  const [bollingerBands, setBollingerBands] = useState<{upper: LineData[], middle: LineData[], lower: LineData[]}>({upper: [], middle: [], lower: []});
  const [adxData, setAdxData] = useState<LineData[]>([]);
  const [smaData, setSmaData] = useState<LineData[]>([]);

  const [showRSI, setShowRSI] = useState(true);
  const [showEMA9, setShowEMA9] = useState(true);
  const [showEMA21, setShowEMA21] = useState(true);
  const [showEMA50, setShowEMA50] = useState(false);
  const [showEMA200, setShowEMA200] = useState(false);
  const [showMACD, setShowMACD] = useState(true);
  const [showBollingerBands, setShowBollingerBands] = useState(false);
  const [showADX, setShowADX] = useState(false);
  const [showSMA, setShowSMA] = useState(false);

  const [stopLossPercent, setStopLossPercent] = useState<number>(2);
  const [takeProfitPercent, setTakeProfitPercent] = useState<number>(5);
  const [trailingStopEnabled, setTrailingStopEnabled] = useState<boolean>(false);
  const [maxDailyLossPercent, setMaxDailyLossPercent] = useState<number>(10);
  const [leverage, setLeverage] = useState<number>(10);

  const [tradeProposals, setTradeProposals] = useState<TradeProposal[]>([]);

  const timeframes = [
    { value: '1m', label: t('timeframes.1m') }, { value: '5m', label: t('timeframes.5m') },
    { value: '15m', label: t('timeframes.15m') }, { value: '30m', label: t('timeframes.30m') },
    { value: '1h', label: t('timeframes.1h') }, { value: '2h', label: t('timeframes.2h') },
    { value: '4h', label: t('timeframes.4h') }, { value: '1d', label: t('timeframes.1d') },
    { value: '1w', label: t('timeframes.1w') }, { value: '1M', label: t('timeframes.1M') },
  ];
  const symbols = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'ADAUSDT', 'XRPUSDT', 'SOLUSDT', 'DOTUSDT'];

  const mapEmaToLineData = (emaValues: number[], baseTimes: Time[], period: number): LineData[] => {
    const result: LineData[] = [];
    const emaLength = emaValues.length;
    const timeOffset = period -1;
    for (let i = 0; i < emaLength; i++) {
        const timeIndex = i + timeOffset;
        if (timeIndex < baseTimes.length && emaValues[i] !== undefined) {
            result.push({ time: baseTimes[timeIndex], value: emaValues[i] });
        }
    }
    return result;
  };

  const loadKlinesData = useCallback(async () => {
    setLoading(true);
    setError(null);
    let calculatedEma9Data: LineData[] = [];
    let calculatedEma21Data: LineData[] = [];
    let calculatedRsiData: LineData[] = [];

    try {
      const params: FetchMarketDataParams = { symbol, interval: selectedInterval, limit };
      const rawData: ApiKlineData[] = await fetchMarketKlines(params);
      const formattedData: CandlestickData[] = rawData.map((k: ApiKlineData) => ({
        time: (k.open_time / 1000) as UTCTimestamp,
        open: parseFloat(k.open), high: parseFloat(k.high),
        low: parseFloat(k.low), close: parseFloat(k.close),
      })).sort((a,b) => Number(a.time) - Number(b.time));
      setKlineData(formattedData);

      if (formattedData.length > 0) {
        const closes = formattedData.map(d => d.close);
        const times = formattedData.map(d => d.time as UTCTimestamp);

        calculatedRsiData = showRSI ? generateSimpleMovingAverage(formattedData, 'close', 14) : [];
        setRsiData(calculatedRsiData);

        calculatedEma9Data = showEMA9 ? mapEmaToLineData(calculateEMA(closes, 9), times, 9) : [];
        setEma9Data(calculatedEma9Data);

        calculatedEma21Data = showEMA21 ? mapEmaToLineData(calculateEMA(closes, 21), times, 21) : [];
        setEma21Data(calculatedEma21Data);

        if (showEMA50) setEma50Data(mapEmaToLineData(calculateEMA(closes, 50), times, 50)); else setEma50Data([]);
        if (showEMA200) setEma200Data(mapEmaToLineData(calculateEMA(closes, 200), times, 200)); else setEma200Data([]);
        if (showMACD) setMacdData(generateMACDData(formattedData, muiTheme)); else setMacdData({line: [], signal: [], hist: []});
        if (showBollingerBands) setBollingerBands(generateBollingerBands(formattedData, 20, 2)); else setBollingerBands({upper: [], middle: [], lower: []});
        if (showADX) setAdxData(generateSimpleMovingAverage(formattedData, 'high', 14)); else setAdxData([]);
        if (showSMA) setSmaData(generateSimpleMovingAverage(formattedData, 'close', 20)); else setSmaData([]);

        const currentProposals: TradeProposal[] = [];
        const latestEma9 = calculatedEma9Data[calculatedEma9Data.length-1]?.value;
        const prevEma9 = calculatedEma9Data[calculatedEma9Data.length-2]?.value;
        const latestEma21 = calculatedEma21Data[calculatedEma21Data.length-1]?.value;
        const prevEma21 = calculatedEma21Data[calculatedEma21Data.length-2]?.value;
        const latestRsi = calculatedRsiData[calculatedRsiData.length-1]?.value;

        if (formattedData.length > 1 && latestEma9 !== undefined && prevEma9 !== undefined && latestEma21 !== undefined && prevEma21 !== undefined && latestRsi !== undefined) {
            const lastCandle = formattedData[formattedData.length -1];
            if (prevEma9 < prevEma21 && latestEma9 > latestEma21 && latestRsi < 70) {
                currentProposals.push({
                    id: `buy-${Date.now()}`, pair: symbol, timeframe: selectedInterval, signal: 'BUY',
                    entryPrice: lastCandle.close, stopLoss: lastCandle.close * (1 - stopLossPercent / 100),
                    takeProfit: lastCandle.close * (1 + takeProfitPercent / 100),
                    reason: t('dashboard.tradeProposals.reasons.emaCrossBuy', { rsi: latestRsi.toFixed(2) })
                });
            } else if (prevEma9 > prevEma21 && latestEma9 < latestEma21 && latestRsi > 30) {
                 currentProposals.push({
                    id: `sell-${Date.now()}`, pair: symbol, timeframe: selectedInterval, signal: 'SELL',
                    entryPrice: lastCandle.close, stopLoss: lastCandle.close * (1 + stopLossPercent / 100),
                    takeProfit: lastCandle.close * (1 - takeProfitPercent / 100),
                    reason: t('dashboard.tradeProposals.reasons.emaCrossSell', { rsi: latestRsi.toFixed(2) })
                });
            }
        }
        setTradeProposals(currentProposals);

      } else {
        setKlineData([]);
        setRsiData([]); setEma9Data([]); setEma21Data([]); setEma50Data([]); setEma200Data([]);
        setMacdData({line: [], signal: [], hist: []}); setBollingerBands({upper: [], middle: [], lower: []});
        setAdxData([]); setSmaData([]); setTradeProposals([]);
      }
    } catch (err) {
      setError(t('errors.fetchKlinesFailed'));
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [symbol, selectedInterval, limit, t, stopLossPercent, takeProfitPercent, muiTheme,
      showRSI, showEMA9, showEMA21, showEMA50, showEMA200, showMACD, showBollingerBands, showADX, showSMA
    ]);

  useEffect(() => {
    loadKlinesData();
    const refreshIntervalId = window.setInterval(loadKlinesData, 60000);
    return () => window.clearInterval(refreshIntervalId);
  }, [loadKlinesData]);

  const handleExecuteTrade = (proposalId: string) => { console.log(`Executing trade for proposal: ${proposalId}`); setTradeProposals(prev => prev.filter(p => p.id !== proposalId)); };
  const handleRejectTrade = (proposalId: string) => { console.log(`Rejecting trade for proposal: ${proposalId}`); setTradeProposals(prev => prev.filter(p => p.id !== proposalId)); };

  return (
    <Container maxWidth={false} sx={{ mt: 4, mb: 4 }}>
      <Typography variant="h4" gutterBottom sx={{ color: muiTheme.palette.primary.main, mb: 3 }}>
        {t('dashboard.title')}
      </Typography>

      {/* Controls Section */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Box display="flex" flexWrap="wrap" alignItems="center" gap={2}>
          <FormControl sx={{ minWidth: 150, flexGrow: 1 }}>
            <InputLabel id="symbol-select-label">{t('dashboard.controls.symbol')}</InputLabel>
            <Select labelId="symbol-select-label" value={symbol} label={t('dashboard.controls.symbol')} onChange={(e: SelectChangeEvent<string>) => setSymbol(e.target.value)}>
              {symbols.map((s) => (<MenuItem key={s} value={s}>{s}</MenuItem>))}
            </Select>
          </FormControl>
          <FormControl sx={{ minWidth: 150, flexGrow: 1 }}>
            <InputLabel id="interval-select-label">{t('dashboard.controls.timeframe')}</InputLabel>
            <Select labelId="interval-select-label" value={selectedInterval} label={t('dashboard.controls.timeframe')} onChange={(e: SelectChangeEvent<string>) => setSelectedInterval(e.target.value)}>
              {timeframes.map((tf) => (<MenuItem key={tf.value} value={tf.value}>{tf.label}</MenuItem>))}
            </Select>
          </FormControl>
          <TextField type="number" label={t('dashboard.controls.limit')} value={limit} onChange={(e) => setLimit(Math.max(50, parseInt(e.target.value, 10) || 50))} inputProps={{ min: 50, max: 1500 }} size="small" sx={{ minWidth: 100, flexGrow: 1 }} />
          <Tooltip title={t('dashboard.tooltips.botMode')}><FormControlLabel control={<Switch color="primary" />} label={t('dashboard.controls.autoTrade')} sx={{ flexGrow: 0 }} /></Tooltip>
          <Button variant="contained" onClick={loadKlinesData} disabled={loading} sx={{ minWidth: 100, flexGrow: 1 }}>
            {loading ? <CircularProgress size={24} /> : t('dashboard.controls.refresh')}
          </Button>
        </Box>
      </Paper>

      {/* Main Content Area: Chart and Indicator Settings */}
      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: muiTheme.spacing(3), mb: 3 }}>
        {/* Chart Area */}
        <Box sx={{ flexGrow: 1, flexBasis: { xs: '100%', md: '75%' }, width: { xs: '100%', md: '75%' } }}>
          <Paper sx={{ p: 2, minHeight: '650px', display: 'flex', flexDirection: 'column', height: '100%' }}>
            {loading && klineData.length === 0 && <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flexGrow: 1 }}><CircularProgress size={60} /></Box>}
            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
            {!loading && klineData.length === 0 && !error && (
              <Typography sx={{ textAlign: 'center', mt: 2, flexGrow: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{t('dashboard.noData')}</Typography>
            )}
            {klineData.length > 0 && (
              <KlineChart
                data={klineData}
                rsiData={rsiData} ema9Data={ema9Data} ema21Data={ema21Data} ema50Data={ema50Data} ema200Data={ema200Data}
                macdLineData={macdData.line} macdSignalData={macdData.signal} macdHistData={macdData.hist}
                bollingerBandsData={bollingerBands} adxData={adxData} smaData={smaData}
                showRSI={showRSI} showEMA9={showEMA9} showEMA21={showEMA21} showEMA50={showEMA50} showEMA200={showEMA200}
                showMACD={showMACD} showBollingerBands={showBollingerBands} showADX={showADX} showSMA={showSMA}
                theme={muiTheme} height={600} // Explicit height for chart
              />
            )}
          </Paper>
        </Box>

        {/* Indicator Settings */}
        <Box sx={{ flexBasis: { xs: '100%', md: '25%' }, width: { xs: '100%', md: '25%' }, flexShrink: 0 }}>
          <Paper sx={{ p: 2, height: '100%' }}>
            <Typography variant="h6" gutterBottom>{t('dashboard.indicatorSettings.title')}</Typography>
            <FormGroup>
              <FormControlLabel control={<Switch checked={showRSI} onChange={(e) => setShowRSI(e.target.checked)} />} label="RSI" />
              <FormControlLabel control={<Switch checked={showMACD} onChange={(e) => setShowMACD(e.target.checked)} />} label="MACD" />
              <FormControlLabel control={<Switch checked={showBollingerBands} onChange={(e) => setShowBollingerBands(e.target.checked)} />} label="Bollinger Bands" />
              <FormControlLabel control={<Switch checked={showEMA9} onChange={(e) => setShowEMA9(e.target.checked)} />} label="EMA 9" />
              <FormControlLabel control={<Switch checked={showEMA21} onChange={(e) => setShowEMA21(e.target.checked)} />} label="EMA 21" />
              <FormControlLabel control={<Switch checked={showEMA50} onChange={(e) => setShowEMA50(e.target.checked)} />} label="EMA 50" />
              <FormControlLabel control={<Switch checked={showEMA200} onChange={(e) => setShowEMA200(e.target.checked)} />} label="EMA 200" />
              <FormControlLabel control={<Switch checked={showSMA} onChange={(e) => setShowSMA(e.target.checked)} />} label="SMA 20" />
              <FormControlLabel control={<Switch checked={showADX} onChange={(e) => setShowADX(e.target.checked)} />} label="ADX" />
            </FormGroup>
          </Paper>
        </Box>
      </Box>

      {/* Trade Proposals */}
      {tradeProposals.length > 0 && (
        <Paper sx={{ p: 2, mb: 3 }}>
          <Typography variant="h6" gutterBottom sx={{ color: muiTheme.palette.secondary.main }}> {t('dashboard.tradeProposals.title')} </Typography>
          {tradeProposals.map((proposal) => (
            <Box key={proposal.id} sx={{ mb: 2, p: 2, border: `1px solid ${muiTheme.palette.divider}`, borderRadius: 1 }}>
              <Box display="flex" flexWrap="wrap" alignItems="center" gap={1.5}>
                <Box sx={{ minWidth: 120, flexBasis: {xs: '100%', sm: 150}, flexGrow: {xs: 1, sm:0} }}><Typography variant="subtitle1"> {proposal.pair} ({proposal.timeframe}) </Typography></Box>
                <Box sx={{ minWidth: 60, flexBasis: {xs: '100%', sm: 'auto'} }}><Typography variant="h6" color={proposal.signal === 'BUY' ? 'success.main' : 'error.main'}> {proposal.signal} </Typography></Box>
                <Box sx={{ flexGrow: 1, flexBasis: {xs: '100%', sm: 200}, minWidth: 180 }}>
                  <Typography variant="body2"> {t('dashboard.tradeProposals.entry')}: {proposal.entryPrice?.toFixed(4)} </Typography>
                  <Typography variant="body2" sx={{color: proposal.signal === 'BUY' ? muiTheme.palette.error.light : muiTheme.palette.success.light }}> {t('dashboard.tradeProposals.sl')}: {proposal.stopLoss?.toFixed(4)} </Typography>
                  <Typography variant="body2" sx={{color: proposal.signal === 'BUY' ? muiTheme.palette.success.light : muiTheme.palette.error.light }}> {t('dashboard.tradeProposals.tp')}: {proposal.takeProfit?.toFixed(4)} </Typography>
                </Box>
                <Box sx={{ flexGrow: 1, flexBasis: {xs: '100%', sm: 200}, minWidth: 180 }}>
                    <Tooltip title={proposal.reason}>
                         <Box component="span" sx={{ display: 'block', maxHeight: '3em', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                             <Typography variant="caption" sx={{ fontStyle: 'italic' }}>{t('dashboard.tradeProposals.reasonLabel')}: {proposal.reason}</Typography>
                         </Box>
                    </Tooltip>
                </Box>
                <Box sx={{ display: 'flex', gap: 1, flexBasis: {xs: '100%', sm: 'auto'}, justifyContent: {xs: 'flex-start', sm: 'flex-end'}, mt: {xs: 1, sm: 0} }}>
                  <Button variant="contained" color="success" size="small" onClick={() => handleExecuteTrade(proposal.id)}> {t('dashboard.tradeProposals.execute')} </Button>
                  <Button variant="outlined" color="error" size="small" onClick={() => handleRejectTrade(proposal.id)}> {t('dashboard.tradeProposals.reject')} </Button>
                </Box>
              </Box>
            </Box>
          ))}
        </Paper>
      )}

      {/* Bottom Row: Risk Management, Open Positions, Balance Info */}
      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: muiTheme.spacing(3) }}>
        {/* Risk Management */}
        <Box sx={{ flexGrow: 1, flexBasis: { xs: '100%', md: '50%' }, width: { xs: '100%', md: '50%' } }}>
            <Paper sx={{ p: 2, height: '100%' }}>
                <Typography variant="h6" gutterBottom> {t('dashboard.riskManagement.title')} </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: muiTheme.spacing(2)}}>
                    <Tooltip title={t('dashboard.tooltips.leverage')} sx={{flexGrow:1, flexBasis: {xs: '100%', sm: `calc(50% - ${muiTheme.spacing(1)})`}, minWidth: 150}}>
                        <TextField fullWidth label={t('dashboard.riskManagement.leverage')} type="number" value={leverage} onChange={(e) => setLeverage(Math.max(1, parseInt(e.target.value,10)))} InputProps={{ inputProps: { min: 1, step: "1" } }} size="small"/>
                    </Tooltip>
                    <Tooltip title={t('dashboard.tooltips.stopLoss')} sx={{flexGrow:1, flexBasis: {xs: '100%', sm: `calc(50% - ${muiTheme.spacing(1)})`}, minWidth: 150}}>
                        <TextField fullWidth label={t('dashboard.riskManagement.stopLoss')} type="number" value={stopLossPercent} onChange={(e) => setStopLossPercent(parseFloat(e.target.value))} InputProps={{ inputProps: { min: 0.1, step: "0.1" }, endAdornment: '%' }} size="small"/>
                    </Tooltip>
                    <Tooltip title={t('dashboard.tooltips.takeProfit')} sx={{flexGrow:1, flexBasis: {xs: '100%', sm: `calc(50% - ${muiTheme.spacing(1)})`}, minWidth: 150}}>
                        <TextField fullWidth label={t('dashboard.riskManagement.takeProfit')} type="number" value={takeProfitPercent} onChange={(e) => setTakeProfitPercent(parseFloat(e.target.value))} InputProps={{ inputProps: { min: 0.1, step: "0.1" }, endAdornment: '%' }} size="small"/>
                    </Tooltip>
                    <Tooltip title={t('dashboard.tooltips.maxDailyLoss')} sx={{flexGrow:1, flexBasis: {xs: '100%', sm: `calc(50% - ${muiTheme.spacing(1)})`}, minWidth: 150}}>
                        <TextField fullWidth label={t('dashboard.riskManagement.maxDailyLoss')} type="number" value={maxDailyLossPercent} onChange={(e) => setMaxDailyLossPercent(parseFloat(e.target.value))} InputProps={{ inputProps: { min: 1, step: "1" }, endAdornment: '%' }} size="small"/>
                    </Tooltip>
                    <Box sx={{flexGrow:1, flexBasis: '100%', minWidth: 150}}>
                        <Tooltip title={t('dashboard.tooltips.trailingStop')}><FormControlLabel control={ <Switch checked={trailingStopEnabled} onChange={(e) => setTrailingStopEnabled(e.target.checked)} /> } label={t('dashboard.riskManagement.trailingStop')} /></Tooltip>
                    </Box>
                </Box>
            </Paper>
        </Box>
        {/* Open Positions */}
        <Box sx={{ flexGrow: 1, flexBasis: { xs: '100%', md: '25%' }, width: { xs: '100%', md: '25%' } }}>
            <Paper sx={{ p: 2, height: '100%' }}>
                <Typography variant="h6" gutterBottom> {t('dashboard.openPositions.title')} </Typography>
                <Typography variant="body2" color="textSecondary"> {t('dashboard.openPositions.noPositions')} </Typography>
            </Paper>
        </Box>
        {/* Balance Info */}
        <Box sx={{ flexGrow: 1, flexBasis: { xs: '100%', md: '25%' }, width: { xs: '100%', md: '25%' } }}>
            <Paper sx={{ p: 2, height: '100%' }}>
                <Typography variant="h6">{t('dashboard.balanceInfo.title')}</Typography>
                <Typography>{t('dashboard.balanceInfo.totalBalance')}: $10,000 USDT (Mock)</Typography>
                <Typography>{t('dashboard.balanceInfo.availableBalance')}: $8,500 USDT (Mock)</Typography>
                <Typography>{t('dashboard.balanceInfo.dailyPnl')}: +$150 USDT (Mock)</Typography>
            </Paper>
        </Box>
      </Box>

    </Container>
  );
};

export default DashboardPage;