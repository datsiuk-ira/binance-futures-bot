// frontend/src/pages/DashboardPage.tsx

import React, {useState, useEffect, useCallback, useRef} from 'react';
import {
    Box, Container, Typography, Paper, CircularProgress, TextField,
    FormControlLabel, Switch, Select, MenuItem, InputLabel, FormControl, Button, Stack, ToggleButtonGroup, ToggleButton, useTheme, Chip
} from '@mui/material';
import KlineChart, { ProcessedChartData } from '../components/KlineChart';
import { getHistoricalIndicators, calculateRiskManagementOnBackend, RiskCalculationParams, RiskCalculationResponse, getSignalAnalysis, getArimaForecast } from '../api/marketDataService';
import { UTCTimestamp } from 'lightweight-charts';
import {
    Kline,
    IndicatorData as BackendIndicatorData,
    HistoricalDataResponse,
    SignalData,
    IchimokuCloudData,
    FibonacciRetracementData,
    ArimaResponse
} from '../types/marketData';
import { alpha } from '@mui/material/styles';
import RefreshIcon from '@mui/icons-material/Refresh';

import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import {isAxiosError} from "axios";
import {useTranslation} from "react-i18next";


const DashboardPage: React.FC = () => {
    const { t } = useTranslation();
    const [marketData, setMarketData] = useState<ProcessedChartData[]>([]);
    const [loadingChart, setLoadingChart] = useState<boolean>(true);
    const [loadingRiskCalc, setLoadingRiskCalc] = useState<boolean>(false);
    const [loadingSignal, setLoadingSignal] = useState<boolean>(false);
    const [chartError, setChartError] = useState<string | null>(null);
    const [riskCalcError, setRiskCalcError] = useState<string | null>(null);


    const [symbol, setSymbol] = useState<string>('BTCUSDT');
    const [interval, setInterval] = useState<string>('1m');
    const [limit, setLimit] = useState<number>(300);

    // Indicator toggles
    const [showMA, setShowMA] = useState<boolean>(true);
    const [showEMA, setShowEMA] = useState<boolean>(true);
    const [showBollingerBands, setShowBollingerBands] = useState<boolean>(true);
    const [showMACD, setShowMACD] = useState<boolean>(true);
    const [showRSI, setShowRSI] = useState<boolean>(true);
    const [showADX, setShowADX] = useState<boolean>(true); // New
    const [showATR, setShowATR] = useState<boolean>(false); // New - often on separate pane or not plotted by default
    const [showIchimoku, setShowIchimoku] = useState<boolean>(true); // New
    const [showFibonacci, setShowFibonacci] = useState<boolean>(false); // New - default off, can be noisy
    const [showVWAP, setShowVWAP] = useState<boolean>(true); // New


    const [accountBalance, setAccountBalance] = useState<string>('1000');
    const [riskPercent, setRiskPercent] = useState<string>('1');
    const [leverage, setLeverage] = useState<string>('10');
    const [entryPrice, setEntryPrice] = useState<string>('');
    const [stopLossPrice, setStopLossPrice] = useState<string>('');
    const [takeProfitPrice, setTakeProfitPrice] = useState<string>('');
    const [positionSide, setPositionSide] = useState<'BUY' | 'SELL'>('BUY');

    const [positionSizeAsset, setPositionSizeAsset] = useState<string>('-');
    const [positionSizeUSD, setPositionSizeUSD] = useState<string>('-');
    const [potentialLoss, setPotentialLoss] = useState<string>('-');
    const [potentialProfit, setPotentialProfit] = useState<string>('-');
    const [riskRewardRatio, setRiskRewardRatio] = useState<string>('-');
    const [liquidationPrice, setLiquidationPrice] = useState<string>('-');

    const [signalData, setSignalData] = useState<SignalData | null>(null);
    const [lastSignalUpdate, setLastSignalUpdate] = useState<Date | null>(null);

    const [showARIMA, setShowARIMA] = useState<boolean>(true);
    const [arimaData, setArimaData] = useState<ArimaResponse | null>(null);
    const [loadingArima, setLoadingArima] = useState<boolean>(false);
    const [arimaError, setArimaError] = useState<string | null>(null);

    const theme = useTheme();
    const chartUpdateIntervalRef = useRef<number | null>(null);

    const availableSymbols = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT', 'DOGEUSDT', 'ADAUSDT', 'AVAXUSDT', 'DOTUSDT', 'MATICUSDT', 'LINKUSDT', 'TRXUSDT', 'LTCUSDT', 'BCHUSDT', 'ATOMUSDT'];
    const availableIntervals = ['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '8h', '12h', '1d', '3d', '1w', '1M'];

    const fetchChartData = useCallback(async (isAutoUpdate = false) => {
        if (!isAutoUpdate) {
            setLoadingChart(true);
        }
        setChartError(null);
        try {
            const response: HistoricalDataResponse = await getHistoricalIndicators(symbol, interval, limit);
            if (!response || !response.klines || response.klines.length === 0) {
                setChartError(`No kline data received for ${symbol} on ${interval}. Backend might be missing data or encountered an issue.`);
                setMarketData([]);
                setLoadingChart(false);
                return;
            }

            const { klines, indicators } = response;
            const indicatorTimestamps = indicators.timestamps || [];

            const getValue = (arr: (number | null)[] | undefined, index: number): number | undefined =>
                (arr && index >= 0 && index < arr.length && arr[index] !== null && arr[index] !== undefined) ? arr[index] as number : undefined;

            const chartableData = klines.map((kline: Kline): ProcessedChartData => {
                const klineTimestampMs = kline.timestamp;
                const indicatorIndex = indicatorTimestamps.findIndex(ts => ts === klineTimestampMs);

                let maValue: number | undefined, emaValue: number | undefined;
                let bbValues: ProcessedChartData['bollingerBands'], macdValues: ProcessedChartData['macd'];
                let rsiValue: number | undefined;
                let adxLineValue: number | undefined, atrLineValue: number | undefined, vwapLineValue: number | undefined;
                let ichimokuValues: ProcessedChartData['ichimokuCloud'] | undefined;
                let fibonacciLevels: ProcessedChartData['fibonacciRetracement'] | undefined;


                if (indicatorIndex !== -1) {
                    if (indicators.sma) maValue = getValue(indicators.sma['sma_20'], indicatorIndex);
                    if (indicators.ema) emaValue = getValue(indicators.ema['ema_50'], indicatorIndex);

                    const bbParamsStr = "20_2.0";
                    const relevantBB = indicators.bollinger_bands?.find(bb => bb.params === bbParamsStr);
                    if (relevantBB) {
                        const u = getValue(relevantBB.upper_band, indicatorIndex);
                        const m = getValue(relevantBB.middle_band, indicatorIndex);
                        const l = getValue(relevantBB.lower_band, indicatorIndex);
                        if (u !== undefined && m !== undefined && l !== undefined) bbValues = { upper: u, middle: m, lower: l };
                    }

                    const macdParamsStr = "12_26_9";
                    const relevantMACD = indicators.macd?.find(m => m.params === macdParamsStr);
                    if (relevantMACD) {
                        const macdL = getValue(relevantMACD.macd_line, indicatorIndex);
                        const sigL = getValue(relevantMACD.signal_line, indicatorIndex);
                        const hist = getValue(relevantMACD.histogram, indicatorIndex);
                        if (macdL !== undefined && sigL !== undefined && hist !== undefined) macdValues = { macd: macdL, signal: sigL, histogram: hist };
                    }
                    if (indicators.rsi) rsiValue = getValue(indicators.rsi['rsi_14'], indicatorIndex);

                    // New indicators
                    adxLineValue = getValue(indicators.adx_line, indicatorIndex);
                    atrLineValue = getValue(indicators.atr_line, indicatorIndex);
                    vwapLineValue = getValue(indicators.vwap_line, indicatorIndex);

                    if (indicators.ichimoku_cloud) {
                        const ic = indicators.ichimoku_cloud;
                        const tenkan = getValue(ic.tenkan_sen, indicatorIndex);
                        const kijun = getValue(ic.kijun_sen, indicatorIndex);
                        const senkouA = getValue(ic.senkou_span_a, indicatorIndex);
                        const senkouB = getValue(ic.senkou_span_b, indicatorIndex);
                        const chikou = getValue(ic.chikou_span, indicatorIndex);
                        ichimokuValues = { tenkan, kijun, senkouA, senkouB, chikou };
                    }

                    if (indicators.fibonacci_retracement) {
                        fibonacciLevels = {};
                        for (const key in indicators.fibonacci_retracement) {
                            // The backend calculates Fib levels only for the last point.
                            // For display across the chart, KlineChart will handle taking the latest available levels.
                            // Here, we just pass through what's available at this specific indicatorIndex.
                            const levelValue = getValue((indicators.fibonacci_retracement as FibonacciRetracementData)[key], indicatorIndex);
                            if (levelValue !== undefined) {
                                (fibonacciLevels as any)[key] = levelValue;
                            }
                        }
                         if (Object.keys(fibonacciLevels).length === 0) fibonacciLevels = undefined;
                    }
                }
                return {
                    time: (klineTimestampMs / 1000) as UTCTimestamp, open: kline.open, high: kline.high, low: kline.low, close: kline.close,
                    ma: maValue, ema: emaValue, bollingerBands: bbValues, macd: macdValues, rsi: rsiValue,
                    adx: adxLineValue, atr: atrLineValue, vwap: vwapLineValue,
                    ichimokuCloud: ichimokuValues,
                    fibonacciRetracement: fibonacciLevels,
                };
            });
            setMarketData(chartableData);
        } catch (error: any) {
            console.error("Failed to fetch chart data:", error);
            const errorMessage = error.message || t('dashboard.errors.unknownChartError');
            setChartError(errorMessage);
            setMarketData([]);
        } finally {
            if (!isAutoUpdate) setLoadingChart(false);
        }
    }, [symbol, interval, limit, t]);

    const fetchSignalData = useCallback(async () => {
        setLoadingSignal(true);
        setSignalData(null);
        try {
            const data = await getSignalAnalysis(symbol, interval);
            setSignalData(data);
            setLastSignalUpdate(new Date());
        } catch (err) {
            console.error("Failed to fetch signal analysis:", err);
            setSignalData({ signal: "ERROR", summary: t('dashboard.errors.fetchSignalError'), confidence: 0, details: {} });
            setLastSignalUpdate(new Date());
        } finally {
            setLoadingSignal(false);
        }
    }, [symbol, interval, t]);

    useEffect(() => {
        if (chartUpdateIntervalRef.current) {
            clearInterval(chartUpdateIntervalRef.current);
        }
        // Refresh chart data (klines and basic indicators) every 30 seconds
        // Signal data is refreshed manually or on param change.
        chartUpdateIntervalRef.current = window.setInterval(() => {
            console.log("Auto-refreshing chart data (klines & indicators)...");
            fetchChartData(true); // Pass true to indicate auto-update (suppresses main loader)
        }, 30000); // 30 seconds

        return () => {
            if (chartUpdateIntervalRef.current) {
                clearInterval(chartUpdateIntervalRef.current);
            }
        };
    }, [fetchChartData]);

    const fetchArimaData = useCallback(async () => {
        if (!symbol || !interval) return;
        setLoadingArima(true);
        setArimaError(null);
        setArimaData(null);
        try {
            const historyForArima = 500;
            const stepsToForecast = 20;
            const optimizeArimaParams = true;

            const data = await getArimaForecast(symbol, interval, historyForArima, stepsToForecast, optimizeArimaParams);
            setArimaData(data);
        } catch (err: any) {
            console.error("Failed to fetch ARIMA data:", err);
            const message = err?.error || err?.detail || err?.message || "Failed to load ARIMA forecast.";
            setArimaError(message);
        } finally {
            setLoadingArima(false);
        }
    }, [symbol, interval]);

    const handlePositionSideChange = (event: React.MouseEvent<HTMLElement>, newPositionSide: 'BUY' | 'SELL' | null) => {
        if (newPositionSide !== null) {
            setPositionSide(newPositionSide);
        }
    };

    const handleCalculateRisk = async () => {
        setLoadingRiskCalc(true);
        setRiskCalcError(null);
        const params: RiskCalculationParams = {
            accountBalance: parseFloat(accountBalance),
            riskPercent: parseFloat(riskPercent),
            leverage: parseFloat(leverage),
            entryPrice: parseFloat(entryPrice),
            stopLossPrice: parseFloat(stopLossPrice),
            takeProfitPrice: takeProfitPrice ? parseFloat(takeProfitPrice) : undefined,
            symbol: symbol,
            positionSide: positionSide,
        };

        if (isNaN(params.accountBalance) || params.accountBalance <= 0 ||
            isNaN(params.riskPercent) || params.riskPercent <= 0 || params.riskPercent > 100 ||
            isNaN(params.leverage) || params.leverage <= 0 ||
            isNaN(params.entryPrice) || params.entryPrice <= 0 ||
            isNaN(params.stopLossPrice) || params.stopLossPrice <= 0) {
             setRiskCalcError(t('dashboard.riskCalc.errors.requiredFieldsPositive'));
             setLoadingRiskCalc(false);
             return;
        }
         if (params.stopLossPrice === params.entryPrice) {
            setRiskCalcError(t('dashboard.riskCalc.errors.slEqualToEntry'));
            setLoadingRiskCalc(false);
            return;
        }
        if (params.positionSide === 'BUY' && params.stopLossPrice >= params.entryPrice) {
            setRiskCalcError(t('dashboard.riskCalc.errors.slAboveEntryForBuy'));
            setLoadingRiskCalc(false);
            return;
        }
        if (params.positionSide === 'SELL' && params.stopLossPrice <= params.entryPrice) {
            setRiskCalcError(t('dashboard.riskCalc.errors.slBelowEntryForSell'));
            setLoadingRiskCalc(false);
            return;
        }
        if (params.takeProfitPrice !== undefined && (isNaN(params.takeProfitPrice) || params.takeProfitPrice <=0) ) {
            setRiskCalcError(t('dashboard.riskCalc.errors.tpPositive'));
            setLoadingRiskCalc(false);
            return;
        }


        try {
            const result: RiskCalculationResponse = await calculateRiskManagementOnBackend(params);
            if (result.errorMessage) {
                setRiskCalcError(result.errorMessage);
                setPositionSizeAsset('-'); setPositionSizeUSD('-');
                setPotentialLoss('-'); setPotentialProfit('-');
                setRiskRewardRatio('-'); setLiquidationPrice('-');
            } else {
                setPositionSizeAsset(String(result.positionSizeAsset ?? '-'));
                setPositionSizeUSD(String(result.positionSizeUSD ?? '-'));
                setPotentialLoss(String(result.potentialLossUSD ?? '-'));
                setPotentialProfit(String(result.potentialProfitUSD ?? '-'));
                setRiskRewardRatio(String(result.riskRewardRatio ?? '-'));
                setLiquidationPrice(String(result.liquidationPrice ?? '-'));
            }
        } catch (err) {
            console.error("Risk calculation submission failed client-side:", err);
            const message = err instanceof Error ? err.message : t('dashboard.riskCalc.errors.clientError');
            setRiskCalcError(message);
        } finally {
            setLoadingRiskCalc(false);
        }
    };

    useEffect(() => {
        fetchChartData();
        fetchSignalData();
        fetchArimaData();
    }, [fetchChartData, fetchSignalData, fetchArimaData]);

    const getSignalChipProperties = (signal?: SignalData['signal']): { color: "success" | "error" | "warning" | "info" | "default", icon: JSX.Element } => {
        switch (signal) {
            case 'STRONG_BUY': return { color: 'success', icon: <TrendingUpIcon /> };
            case 'BUY': return { color: 'success', icon: <TrendingUpIcon /> };
            case 'STRONG_SELL': return { color: 'error', icon: <TrendingDownIcon /> };
            case 'SELL': return { color: 'error', icon: <TrendingDownIcon /> };
            case 'HOLD': return { color: 'warning', icon: <HelpOutlineIcon /> };
            case 'ERROR': return { color: 'default', icon: <InfoOutlinedIcon /> };
            default: return { color: 'info', icon: <InfoOutlinedIcon /> };
        }
    };


    return (
        <Container maxWidth={false} sx={{ mt: 2, mb: 4, padding: { xs: 1, sm: 2 } }}>
            <Typography variant="h4" component="h1" gutterBottom sx={{ textAlign: 'center', color: theme.palette.text.primary, mb:3 }}>
                {t('dashboard.title')}
            </Typography>

            <Paper elevation={2} sx={{ p: { xs: 1.5, sm: 2.5 }, mb: 3, backgroundColor: theme.palette.background.paper }}>
                 <Stack direction={{xs: 'column', lg: 'row'}} spacing={2} alignItems="center">
                    <Stack direction={{xs: 'column', sm: 'row'}} spacing={2} sx={{flexGrow: 3, width: '100%'}} alignItems="center">
                        <FormControl sx={{flex: 1, minWidth: '130px'}}>
                            <InputLabel id="symbol-select-label">{t('dashboard.controls.symbol')}</InputLabel>
                            <Select labelId="symbol-select-label" value={symbol} label={t('dashboard.controls.symbol')} onChange={(e) => setSymbol(e.target.value as string)}>
                                {availableSymbols.map(s => <MenuItem key={s} value={s}>{s}</MenuItem>)}
                            </Select>
                        </FormControl>
                        <FormControl sx={{flex: 1, minWidth: '120px'}}>
                            <InputLabel id="interval-select-label">{t('dashboard.controls.interval')}</InputLabel>
                            <Select labelId="interval-select-label" value={interval} label={t('dashboard.controls.interval')} onChange={(e) => setInterval(e.target.value as string)}>
                                {availableIntervals.map(i => <MenuItem key={i} value={i}>{i}</MenuItem>)}
                            </Select>
                        </FormControl>
                        <TextField
                            sx={{flex: 1, minWidth: '120px'}}
                            label={t('dashboard.controls.candleLimit')} type="number" value={limit}
                            onChange={(e) => { const val = parseInt(e.target.value, 10); setLimit(Math.max(10, Math.min(1500, val)) || 200);}}
                            InputProps={{ inputProps: { min: 10, max: 1500 } }}/>
                         <Button
                            variant="contained"
                            onClick={() => { fetchChartData(); fetchSignalData(); fetchArimaData(); }}
                            disabled={loadingChart || loadingSignal || loadingArima}
                            sx={{ height: '56px', px: {xs: 2, sm:3}, width: {xs: '100%', sm: 'auto'} }}
                        >
                            {(loadingChart || loadingSignal || loadingArima) ? <CircularProgress size={24} color="inherit" /> : t('dashboard.controls.loadData')}
                        </Button>
                    </Stack>
                     <Stack direction="row" spacing={{xs: 0.5, sm:1}} flexWrap="wrap" justifyContent={{xs: 'center', lg:'flex-end'}} alignItems="center" sx={{flexGrow: 2, width: '100%', mt: {xs:2, lg:0}}}>
                        <Typography variant="body2" sx={{mr:1, display: {xs:'none', md:'block'}}}>{t('dashboard.indicators.title')}:</Typography>
                        <FormControlLabel control={<Switch size="small" checked={showMA} onChange={(e) => setShowMA(e.target.checked)} />} label={t('dashboard.indicators.ma')} sx={{mr:0}}/>
                        <FormControlLabel control={<Switch size="small" checked={showEMA} onChange={(e) => setShowEMA(e.target.checked)} />} label={t('dashboard.indicators.ema')} sx={{mr:0}}/>
                        <FormControlLabel control={<Switch size="small" checked={showBollingerBands} onChange={(e) => setShowBollingerBands(e.target.checked)} />} label={t('dashboard.indicators.bb')} sx={{mr:0}}/>
                        <FormControlLabel control={<Switch size="small" checked={showMACD} onChange={(e) => setShowMACD(e.target.checked)} />} label={t('dashboard.indicators.macd')} sx={{mr:0}}/>
                        <FormControlLabel control={<Switch size="small" checked={showRSI} onChange={(e) => setShowRSI(e.target.checked)} />} label={t('dashboard.indicators.rsi')} sx={{mr:0}}/>
                        <FormControlLabel control={<Switch size="small" checked={showADX} onChange={(e) => setShowADX(e.target.checked)} />} label={t('dashboard.indicators.adx', 'ADX')} sx={{mr:0}}/>
                        <FormControlLabel control={<Switch size="small" checked={showATR} onChange={(e) => setShowATR(e.target.checked)} />} label={t('dashboard.indicators.atr', 'ATR')} sx={{mr:0}}/>
                        <FormControlLabel control={<Switch size="small" checked={showIchimoku} onChange={(e) => setShowIchimoku(e.target.checked)} />} label={t('dashboard.indicators.ichimoku', 'Ichimoku')} sx={{mr:0}}/>
                        <FormControlLabel control={<Switch size="small" checked={showFibonacci} onChange={(e) => setShowFibonacci(e.target.checked)} />} label={t('dashboard.indicators.fibonacci', 'Fib')} sx={{mr:0}}/>
                        <FormControlLabel control={<Switch size="small" checked={showVWAP} onChange={(e) => setShowVWAP(e.target.checked)} />} label={t('dashboard.indicators.vwap', 'VWAP')} />
                        <FormControlLabel control={<Switch size="small" checked={showARIMA} onChange={(e) => setShowARIMA(e.target.checked)} />} label={t('dashboard.indicators.arima', 'ARIMA')} />
                    </Stack>
                </Stack>
            </Paper>

            {chartError &&
                <Paper elevation={0} sx={{ textAlign: 'center', mb: 2, p:1.5, backgroundColor: theme.palette.error.light, color: theme.palette.error.contrastText, borderRadius:1 }}>
                    <Typography variant="body1">{chartError}</Typography>
                </Paper>
            }
            {arimaError &&
                <Paper elevation={0} sx={{ textAlign: 'center', mb: 2, p:1.5, backgroundColor: theme.palette.error.light, color: theme.palette.error.contrastText, borderRadius:1 }}>
                    <Typography variant="body1">ARIMA Error: {arimaError}</Typography>
                </Paper>
            }

            <Paper elevation={3} sx={{ p: 0, mb: 3, backgroundColor: theme.palette.background.default, overflow: 'hidden', minHeight: 700 }}>
                 { (loadingChart && !marketData.length && !chartError) || (loadingArima && !arimaData && !arimaError && marketData.length === 0) ? (
                    <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100%', minHeight: '650px' }}>
                        <CircularProgress size={60} />
                        <Typography variant="h6" sx={{mt: 2}}>{t('dashboard.chart.loading', 'Loading Chart Data...')}</Typography>
                    </Box>
                ) : marketData.length > 0 ? (
                    <KlineChart
                        data={marketData}
                        interval={interval}
                        height={700}
                        backgroundColor={theme.palette.mode === 'dark' ? '#131722' : '#f0f3fa'}
                        showMA={showMA}
                        showEMA={showEMA}
                        showBollingerBands={showBollingerBands}
                        showMACD={showMACD}
                        showRSI={showRSI}
                        showADX={showADX}
                        showATR={showATR}
                        showIchimoku={showIchimoku}
                        showFibonacci={showFibonacci}
                        showVWAP={showVWAP}
                        arimaData={arimaData}
                        showARIMA={showARIMA}
                    />
                ) : (
                     !loadingChart &&
                     <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', minHeight: '650px' }}>
                        <Typography variant="h6">
                            {chartError ? t('dashboard.chart.errorPlaceholder') : t('dashboard.chart.noDataPlaceholder')}
                        </Typography>
                     </Box>
                )}
            </Paper>

            <Paper elevation={2} sx={{ p: { xs: 1.5, sm: 2.5 }, mb: 3, backgroundColor: theme.palette.background.paper }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1}}>
                    <Typography variant="h6" component="h2">
                        {t('dashboard.signalAnalysis.title')} ({symbol} @ {interval})
                    </Typography>
                    <Button
                        onClick={() => fetchSignalData()}
                        disabled={loadingSignal}
                        size="small"
                        startIcon={loadingSignal ? <CircularProgress size={16} /> : <RefreshIcon />}
                    >
                        {t('dashboard.signalAnalysis.refresh')}
                    </Button>
                </Box>
                {loadingSignal && !signalData ? (
                    <Box sx={{display: 'flex', alignItems: 'center', minHeight: '50px'}}> <CircularProgress size={24} sx={{mr:1}}/> <Typography>{t('dashboard.signalAnalysis.loading')}</Typography></Box>
                ) : signalData ? (
                    <Stack spacing={1}>
                        <Box sx={{display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap'}}>
                             <Typography variant="subtitle1" sx={{fontWeight: 'bold'}}>{t('dashboard.signalAnalysis.currentSignal')}:</Typography>
                             <Chip
                                icon={getSignalChipProperties(signalData.signal).icon}
                                label={signalData.signal ? t(`dashboard.signalAnalysis.signals.${signalData.signal.toLowerCase()}`, signalData.signal.replace('_', ' ')) : t('common.na')}
                                color={getSignalChipProperties(signalData.signal).color}
                                size="medium"
                             />
                             {signalData.confidence != null && <Chip label={`${t('dashboard.signalAnalysis.confidence')}: ${(signalData.confidence * 100).toFixed(0)}%`} size="small" variant="outlined" />}
                        </Box>
                        <Typography variant="body1" sx={{fontStyle: 'italic'}}>{t('dashboard.signalAnalysis.summary')}: {signalData.summary || t('dashboard.signalAnalysis.noSummary')}</Typography>
                        {signalData.details && Object.keys(signalData.details).length > 0 && (
                             <Box mt={1}>
                                <Typography variant="body2" sx={{fontWeight: 'medium'}}>{t('dashboard.signalAnalysis.details')}:</Typography>
                                <Paper variant="outlined" sx={{p:1.5, background: alpha(theme.palette.grey[500], 0.05)}}>
                                <Stack spacing={0.5}>
                                {Object.entries(signalData.details).map(([key, value]) => (
                                    <Typography key={key} variant="caption">{`${t(`dashboard.signalAnalysis.detailKeys.${key}`, key)}: ${typeof value === 'number' ? value.toFixed(2) : value}`}</Typography>
                                ))}
                                </Stack>
                                </Paper>
                             </Box>
                        )}
                        {lastSignalUpdate && (
                            <Typography variant="caption" sx={{ color: 'text.secondary', textAlign: 'right', mt: 1 }}>
                                {t('dashboard.signalAnalysis.lastUpdated')}: {lastSignalUpdate.toLocaleTimeString()}
                            </Typography>
                        )}
                    </Stack>
                ) : (
                    <Typography>{t('dashboard.signalAnalysis.noData')}</Typography>
                )}
            </Paper>


            <Paper elevation={2} sx={{ p: { xs: 1.5, sm: 2.5 }, backgroundColor: theme.palette.background.paper }}>
                <Typography variant="h6" component="h2" gutterBottom>{t('dashboard.riskCalc.title')} ({symbol})</Typography>
                <Stack spacing={2.5}>
                    <ToggleButtonGroup
                        value={positionSide} exclusive onChange={handlePositionSideChange}
                        aria-label="position side" fullWidth color="primary" sx={{ mb: 1 }} >
                        <ToggleButton value="BUY" aria-label="buy side" sx={{flexGrow:1, '&.Mui-selected': {color: theme.palette.success.main, backgroundColor: alpha(theme.palette.success.main, 0.12)}, '&:hover':{backgroundColor: alpha(theme.palette.success.main, 0.05)}}}>
                            <TrendingUpIcon sx={{mr:1}}/> {t('dashboard.riskCalc.buyLong')}
                        </ToggleButton>
                        <ToggleButton value="SELL" aria-label="sell side" sx={{flexGrow:1, '&.Mui-selected': {color: theme.palette.error.main, backgroundColor: alpha(theme.palette.error.main, 0.12)}, '&:hover':{backgroundColor: alpha(theme.palette.error.main, 0.05)}}}>
                            <TrendingDownIcon sx={{mr:1}}/> {t('dashboard.riskCalc.sellShort')}
                        </ToggleButton>
                    </ToggleButtonGroup>

                    <Stack direction={{xs: 'column', md: 'row'}} spacing={2}>
                        <TextField fullWidth label={t('dashboard.riskCalc.accountBalance')} value={accountBalance} onChange={e=> setAccountBalance(e.target.value)} type="number" sx={{flex:1}} InputProps={{ inputProps: { step: "100", min: "0" } }}/>
                        <TextField fullWidth label={t('dashboard.riskCalc.riskPerTrade')} value={riskPercent} onChange={e => setRiskPercent(e.target.value)} type="number" sx={{flex:1}} InputProps={{ inputProps: { step: "0.1", min:"0.1", max:"100" } }}/>
                        <TextField fullWidth label={t('dashboard.riskCalc.leverage')} value={leverage} onChange={e => setLeverage(e.target.value)} type="number" sx={{flex:1}} InputProps={{ inputProps: { step: "1", min:"1", max:"125" } }}/>
                    </Stack>
                    <Stack direction={{xs: 'column', md: 'row'}} spacing={2}>
                        <TextField fullWidth label={t('dashboard.riskCalc.entryPrice')} value={entryPrice} onChange={e => setEntryPrice(e.target.value)} type="number" sx={{flex:1}} InputProps={{ inputProps: { step: "any", min: "0" } }}/>
                        <TextField fullWidth label={t('dashboard.riskCalc.stopLossPrice')} value={stopLossPrice} onChange={e => setStopLossPrice(e.target.value)} type="number" sx={{flex:1}} InputProps={{ inputProps: { step: "any", min: "0" } }}/>
                        <TextField fullWidth label={t('dashboard.riskCalc.takeProfitPrice')} value={takeProfitPrice} onChange={e => setTakeProfitPrice(e.target.value)} type="number" sx={{flex:1}} InputProps={{ inputProps: { step: "any", min: "0" } }}/>
                    </Stack>
                    <Button variant="contained" color="primary" onClick={handleCalculateRisk} disabled={loadingRiskCalc} sx={{ mt: 2, mb:1, alignSelf: {xs: 'stretch', sm:'flex-start'} }}>
                        {loadingRiskCalc ? <CircularProgress size={24} color="inherit"/> : t('dashboard.riskCalc.calculateButton')}
                    </Button>

                    {riskCalcError && <Typography color="error" sx={{mt:1, fontSize: '0.875rem'}}>{riskCalcError}</Typography>}

                    <Box sx={{mt: 1.5, p:2, border: `1px solid ${theme.palette.divider}`, borderRadius: 1, background: alpha(theme.palette.mode === 'dark' ? theme.palette.grey[800] : theme.palette.grey[100], 0.5)}}>
                        <Typography variant="subtitle1" component="h3" gutterBottom sx={{color: theme.palette.primary.main, fontWeight:'medium'}}>{t('dashboard.riskCalc.resultsTitle')}:</Typography>
                        <Stack spacing={0.8}>
                           <Typography>{t('dashboard.riskCalc.positionSizeAsset')}: <strong style={{color: theme.palette.text.primary}}>{positionSizeAsset}</strong></Typography>
                           <Typography>{t('dashboard.riskCalc.positionSizeUSD')}: <strong style={{color: theme.palette.text.primary}}>{positionSizeUSD}</strong></Typography>
                           <Typography>{t('dashboard.riskCalc.potentialLoss')}: <strong style={{color: theme.palette.error.main}}>{potentialLoss}</strong></Typography>
                           <Typography>{t('dashboard.riskCalc.potentialProfit')}: <strong style={{color: theme.palette.success.main}}>{potentialProfit}</strong></Typography>
                           <Typography>{t('dashboard.riskCalc.riskRewardRatio')}: <strong style={{color: theme.palette.text.primary}}>{riskRewardRatio}</strong></Typography>
                           <Typography>{t('dashboard.riskCalc.liquidationPrice')}: <strong style={{color: theme.palette.warning.dark}}>{liquidationPrice}</strong></Typography>
                        </Stack>
                    </Box>
                </Stack>
            </Paper>
        </Container>
    );
};

export default DashboardPage;