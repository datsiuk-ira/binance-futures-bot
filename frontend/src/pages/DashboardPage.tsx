import React, { useState, useEffect, useCallback } from 'react';
import {
    Box, Container, Typography, Paper, CircularProgress, TextField,
    FormControlLabel, Switch, Select, MenuItem, InputLabel, FormControl, Button, Stack, ToggleButtonGroup, ToggleButton, useTheme, Chip
} from '@mui/material';
import KlineChart, { ProcessedChartData } from '../components/KlineChart';
import { getHistoricalIndicators, calculateRiskManagementOnBackend, RiskCalculationParams, RiskCalculationResponse, getSignalAnalysis } from '../api/marketDataService';
import { UTCTimestamp } from 'lightweight-charts';
import { Kline, IndicatorData as BackendIndicatorData, HistoricalDataResponse, MACDParams, BollingerBandsParams, SignalData } from '../types/marketData';
import { alpha } from '@mui/material/styles';

// Icons for Buy/Sell and Info
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import {isAxiosError} from "axios"; // For Hold/Error signal


const DashboardPage: React.FC = () => {
    const [marketData, setMarketData] = useState<ProcessedChartData[]>([]);
    const [loadingChart, setLoadingChart] = useState<boolean>(true); // Renamed for clarity
    const [loadingRiskCalc, setLoadingRiskCalc] = useState<boolean>(false);
    const [loadingSignal, setLoadingSignal] = useState<boolean>(false);
    const [chartError, setChartError] = useState<string | null>(null); // Renamed for clarity
    const [riskCalcError, setRiskCalcError] = useState<string | null>(null);


    const [symbol, setSymbol] = useState<string>('BTCUSDT');
    const [interval, setInterval] = useState<string>('1h');
    const [limit, setLimit] = useState<number>(300); // Increased default limit slightly

    // Indicator toggles
    const [showMA, setShowMA] = useState<boolean>(true);
    const [showEMA, setShowEMA] = useState<boolean>(true);
    const [showBollingerBands, setShowBollingerBands] = useState<boolean>(true);
    const [showMACD, setShowMACD] = useState<boolean>(true);
    const [showRSI, setShowRSI] = useState<boolean>(true);

    // Risk Management states
    const [accountBalance, setAccountBalance] = useState<string>('1000');
    const [riskPercent, setRiskPercent] = useState<string>('1');
    const [leverage, setLeverage] = useState<string>('10');
    const [entryPrice, setEntryPrice] = useState<string>('');
    const [stopLossPrice, setStopLossPrice] = useState<string>('');
    const [takeProfitPrice, setTakeProfitPrice] = useState<string>('');
    const [positionSide, setPositionSide] = useState<'BUY' | 'SELL'>('BUY');

    // Calculated risk management values
    const [positionSizeAsset, setPositionSizeAsset] = useState<string>('-');
    const [positionSizeUSD, setPositionSizeUSD] = useState<string>('-');
    const [potentialLoss, setPotentialLoss] = useState<string>('-');
    const [potentialProfit, setPotentialProfit] = useState<string>('-');
    const [riskRewardRatio, setRiskRewardRatio] = useState<string>('-');
    const [liquidationPrice, setLiquidationPrice] = useState<string>('-');

    // Signal Analysis state
    const [signalData, setSignalData] = useState<SignalData | null>(null);

    const theme = useTheme();

    const availableSymbols = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT', 'DOGEUSDT', 'ADAUSDT', 'AVAXUSDT', 'DOTUSDT', 'MATICUSDT', 'LINKUSDT', 'TRXUSDT', 'LTCUSDT', 'BCHUSDT', 'ATOMUSDT'];
    const availableIntervals = ['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '8h', '12h', '1d', '3d', '1w', '1M'];

    const fetchChartData = useCallback(async () => {
        setLoadingChart(true);
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

                if (indicatorIndex !== -1) {
                    // Standard indicator keys (must match backend configuration)
                    if (indicators.sma) maValue = getValue(indicators.sma['sma_20'], indicatorIndex);
                    if (indicators.ema) emaValue = getValue(indicators.ema['ema_50'], indicatorIndex);

                    const bbParamsStr = "20_2.0"; // Example: 20 periods, 2 std deviations
                    const relevantBB = indicators.bollinger_bands?.find(bb => bb.params === bbParamsStr);
                    if (relevantBB) {
                        const u = getValue(relevantBB.upper_band, indicatorIndex);
                        const m = getValue(relevantBB.middle_band, indicatorIndex);
                        const l = getValue(relevantBB.lower_band, indicatorIndex);
                        if (u !== undefined && m !== undefined && l !== undefined) bbValues = { upper: u, middle: m, lower: l };
                    }

                    const macdParamsStr = "12_26_9"; // Example: fast 12, slow 26, signal 9
                    const relevantMACD = indicators.macd?.find(m => m.params === macdParamsStr);
                    if (relevantMACD) {
                        const macdL = getValue(relevantMACD.macd_line, indicatorIndex);
                        const sigL = getValue(relevantMACD.signal_line, indicatorIndex);
                        const hist = getValue(relevantMACD.histogram, indicatorIndex);
                        if (macdL !== undefined && sigL !== undefined && hist !== undefined) macdValues = { macd: macdL, signal: sigL, histogram: hist };
                    }
                    if (indicators.rsi) rsiValue = getValue(indicators.rsi['rsi_14'], indicatorIndex); // Example: 14 periods
                }
                return { time: (klineTimestampMs / 1000) as UTCTimestamp, open: kline.open, high: kline.high, low: kline.low, close: kline.close, ma: maValue, ema: emaValue, bollingerBands: bbValues, macd: macdValues, rsi: rsiValue };
            });
            setMarketData(chartableData);
        } catch (error) {
            console.error("Failed to fetch chart data:", error);
            // Check if the error is an AxiosError and has response data which might be an HTML page (like 500 error page)
            if (isAxiosError(error) && error.response && typeof error.response.data === 'string' && error.response.data.startsWith('<!DOCTYPE html>')) {
                 setChartError(`Server error (${error.response.status}). Check backend logs for details.`);
            } else {
                setChartError(error instanceof Error ? error.message : "Unknown error loading chart data.");
            }
            setMarketData([]);
        } finally {
            setLoadingChart(false);
        }
    }, [symbol, interval, limit]);

    const fetchSignalData = useCallback(async () => { // Renamed for clarity
        setLoadingSignal(true);
        setSignalData(null); // Reset previous signal data
        try {
            const data = await getSignalAnalysis(symbol, interval);
            setSignalData(data);
        } catch (err) {
            console.error("Failed to fetch signal analysis:", err);
            setSignalData({ signal: "ERROR", summary: "Could not fetch signal analysis.", confidence: 0, details: {} });
        } finally {
            setLoadingSignal(false);
        }
    }, [symbol, interval]);


    useEffect(() => {
        fetchChartData();
        fetchSignalData();
    }, [fetchChartData, fetchSignalData]); // Dependencies updated

    const handlePositionSideChange = (event: React.MouseEvent<HTMLElement>, newPositionSide: 'BUY' | 'SELL' | null) => {
        if (newPositionSide !== null) {
            setPositionSide(newPositionSide);
        }
    };

    const handleCalculateRisk = async () => {
        setLoadingRiskCalc(true);
        setRiskCalcError(null); // Clear previous calculation errors
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

        // Basic frontend validation
        if (isNaN(params.accountBalance) || params.accountBalance <= 0 ||
            isNaN(params.riskPercent) || params.riskPercent <= 0 || params.riskPercent > 100 ||
            isNaN(params.leverage) || params.leverage <= 0 ||
            isNaN(params.entryPrice) || params.entryPrice <= 0 ||
            isNaN(params.stopLossPrice) || params.stopLossPrice <= 0) {
             setRiskCalcError("Please fill all required fields (Balance, Risk %, Leverage, Entry, SL) with valid positive numbers.");
             setLoadingRiskCalc(false);
             return;
        }
         if (params.stopLossPrice === params.entryPrice) {
            setRiskCalcError("Entry price and Stop Loss price cannot be the same.");
            setLoadingRiskCalc(false);
            return;
        }
        // Validate SL relative to entry based on position side
        if (params.positionSide === 'BUY' && params.stopLossPrice >= params.entryPrice) {
            setRiskCalcError("For a BUY position, Stop Loss must be below Entry Price.");
            setLoadingRiskCalc(false);
            return;
        }
        if (params.positionSide === 'SELL' && params.stopLossPrice <= params.entryPrice) {
            setRiskCalcError("For a SELL position, Stop Loss must be above Entry Price.");
            setLoadingRiskCalc(false);
            return;
        }
        if (params.takeProfitPrice !== undefined && isNaN(params.takeProfitPrice) || (params.takeProfitPrice !== undefined && params.takeProfitPrice <=0) ) {
            setRiskCalcError("If Take Profit is provided, it must be a valid positive number.");
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
            setRiskCalcError(err instanceof Error ? err.message : "Client-side error during risk calculation submission.");
        } finally {
            setLoadingRiskCalc(false);
        }
    };

    const getSignalChipProperties = (signal?: SignalData['signal']): { color: "success" | "error" | "warning" | "info" | "default", icon: JSX.Element } => {
        switch (signal) {
            case 'STRONG_BUY': return { color: 'success', icon: <TrendingUpIcon /> };
            case 'BUY': return { color: 'success', icon: <TrendingUpIcon /> };
            case 'STRONG_SELL': return { color: 'error', icon: <TrendingDownIcon /> };
            case 'SELL': return { color: 'error', icon: <TrendingDownIcon /> };
            case 'HOLD': return { color: 'warning', icon: <HelpOutlineIcon /> }; // Using HelpOutline for HOLD
            case 'ERROR': return { color: 'default', icon: <InfoOutlinedIcon /> };
            default: return { color: 'info', icon: <InfoOutlinedIcon /> }; // For loading or N/A
        }
    };


    return (
        <Container maxWidth={false} sx={{ mt: 2, mb: 4, padding: { xs: 1, sm: 2 } }}>
            <Typography variant="h4" component="h1" gutterBottom sx={{ textAlign: 'center', color: theme.palette.text.primary, mb:3 }}>
                Trading Dashboard
            </Typography>

            <Paper elevation={2} sx={{ p: { xs: 1.5, sm: 2.5 }, mb: 3, backgroundColor: theme.palette.background.paper }}>
                 <Stack direction={{xs: 'column', lg: 'row'}} spacing={2} alignItems="center">
                    <Stack direction={{xs: 'column', sm: 'row'}} spacing={2} sx={{flexGrow: 3, width: '100%'}} alignItems="center">
                        <FormControl sx={{flex: 1, minWidth: '130px'}}>
                            <InputLabel id="symbol-select-label">Symbol</InputLabel>
                            <Select labelId="symbol-select-label" value={symbol} label="Symbol" onChange={(e) => setSymbol(e.target.value as string)}>
                                {availableSymbols.map(s => <MenuItem key={s} value={s}>{s}</MenuItem>)}
                            </Select>
                        </FormControl>
                        <FormControl sx={{flex: 1, minWidth: '120px'}}>
                            <InputLabel id="interval-select-label">Interval</InputLabel>
                            <Select labelId="interval-select-label" value={interval} label="Interval" onChange={(e) => setInterval(e.target.value as string)}>
                                {availableIntervals.map(i => <MenuItem key={i} value={i}>{i}</MenuItem>)}
                            </Select>
                        </FormControl>
                        <TextField
                            sx={{flex: 1, minWidth: '120px'}}
                            label="Candle Limit" type="number" value={limit}
                            onChange={(e) => { const val = parseInt(e.target.value, 10); setLimit(Math.max(10, Math.min(1500, val)) || 200);}}
                            InputProps={{ inputProps: { min: 10, max: 1500 } }}/>
                        <Button variant="contained" onClick={() => { fetchChartData(); fetchSignalData();}} disabled={loadingChart || loadingSignal} sx={{ height: '56px', px: {xs: 2, sm:3}, width: {xs: '100%', sm: 'auto'} }}>
                            {(loadingChart || loadingSignal) ? <CircularProgress size={24} color="inherit" /> : "Load Data"}
                        </Button>
                    </Stack>
                    <Stack direction="row" spacing={{xs: 0.5, sm:1}} flexWrap="wrap" justifyContent={{xs: 'center', lg:'flex-end'}} alignItems="center" sx={{flexGrow: 2, width: '100%', mt: {xs:2, lg:0}}}>
                        <Typography variant="body2" sx={{mr:1, display: {xs:'none', sm:'block'}}}>Indicators:</Typography>
                        <FormControlLabel control={<Switch size="small" checked={showMA} onChange={(e) => setShowMA(e.target.checked)} />} label="MA" sx={{mr:0}}/>
                        <FormControlLabel control={<Switch size="small" checked={showEMA} onChange={(e) => setShowEMA(e.target.checked)} />} label="EMA" sx={{mr:0}}/>
                        <FormControlLabel control={<Switch size="small" checked={showBollingerBands} onChange={(e) => setShowBollingerBands(e.target.checked)} />} label="BB" sx={{mr:0}}/>
                        <FormControlLabel control={<Switch size="small" checked={showMACD} onChange={(e) => setShowMACD(e.target.checked)} />} label="MACD" sx={{mr:0}}/>
                        <FormControlLabel control={<Switch size="small" checked={showRSI} onChange={(e) => setShowRSI(e.target.checked)} />} label="RSI" />
                    </Stack>
                </Stack>
            </Paper>

            {chartError &&
                <Paper elevation={0} sx={{ textAlign: 'center', mb: 2, p:1.5, backgroundColor: theme.palette.error.light, color: theme.palette.error.contrastText, borderRadius:1 }}>
                    <Typography variant="body1">{chartError}</Typography>
                </Paper>
            }

            <Paper elevation={3} sx={{ p: 0, mb: 3, backgroundColor: theme.palette.background.default, overflow: 'hidden', minHeight: 700 }}>
                {loadingChart && !marketData.length ? (
                    <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100%', minHeight: '650px' }}>
                        <CircularProgress size={60} />
                        <Typography variant="h6" sx={{mt: 2}}>Loading Chart Data...</Typography>
                    </Box>
                ) : marketData.length > 0 ? (
                    <KlineChart
                        data={marketData}
                        height={700}
                        backgroundColor={theme.palette.mode === 'dark' ? '#131722' : '#f0f3fa'}
                        showMA={showMA}
                        showEMA={showEMA}
                        showBollingerBands={showBollingerBands}
                        showMACD={showMACD}
                        showRSI={showRSI}
                    />
                ) : (
                     !loadingChart &&
                     <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', minHeight: '650px' }}>
                        <Typography variant="h6">No data to display. Please check symbol/interval or ensure the backend is working correctly.</Typography>
                     </Box>
                )}
            </Paper>

            {/* Signal Analysis Section */}
            <Paper elevation={2} sx={{ p: { xs: 1.5, sm: 2.5 }, mb: 3, backgroundColor: theme.palette.background.paper }}>
                <Typography variant="h6" component="h2" gutterBottom>Signal Analysis ({symbol} @ {interval})</Typography>
                {loadingSignal ? (
                    <Box sx={{display: 'flex', alignItems: 'center', minHeight: '50px'}}> <CircularProgress size={24} sx={{mr:1}}/> <Typography>Loading signal analysis...</Typography></Box>
                ) : signalData ? (
                    <Stack spacing={1}>
                        <Box sx={{display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap'}}>
                             <Typography variant="subtitle1" sx={{fontWeight: 'bold'}}>Current Signal:</Typography>
                             <Chip
                                icon={getSignalChipProperties(signalData.signal).icon}
                                label={signalData.signal?.replace('_', ' ') || "N/A"}
                                color={getSignalChipProperties(signalData.signal).color}
                                size="medium" // Made chip slightly larger
                             />
                             {signalData.confidence != null && (
                                  <Chip
                                    label={`Confidence: ${(signalData.confidence * 100).toFixed(0)}%`}
                                    size="small"
                                    variant="outlined"
                                  />
                             )}
                        </Box>
                        <Typography variant="body1" sx={{fontStyle: 'italic'}}>Summary: {signalData.summary || "No summary available."}</Typography>
                        {signalData.details && Object.keys(signalData.details).length > 0 && (
                             <Box mt={1}>
                                <Typography variant="body2" sx={{fontWeight: 'medium'}}>Details:</Typography>
                                <Paper variant="outlined" sx={{p:1.5, background: alpha(theme.palette.grey[500], 0.05)}}>
                                <Stack spacing={0.5}>
                                {Object.entries(signalData.details).map(([key, value]) => (
                                    <Typography key={key} variant="caption">{`${key}: ${value}`}</Typography>
                                ))}
                                </Stack>
                                </Paper>
                             </Box>
                        )}
                    </Stack>
                ) : (
                    <Typography>No signal analysis data available.</Typography>
                )}
            </Paper>


            <Paper elevation={2} sx={{ p: { xs: 1.5, sm: 2.5 }, backgroundColor: theme.palette.background.paper }}>
                <Typography variant="h6" component="h2" gutterBottom>Risk Management Calculator ({symbol})</Typography>
                <Stack spacing={2.5}>
                    <ToggleButtonGroup
                        value={positionSide}
                        exclusive
                        onChange={handlePositionSideChange}
                        aria-label="position side"
                        fullWidth
                        color="primary"
                        sx={{ mb: 1 }}
                    >
                        <ToggleButton value="BUY" aria-label="buy side" sx={{flexGrow:1, '&.Mui-selected': {color: theme.palette.success.main, backgroundColor: alpha(theme.palette.success.main, 0.12)}, '&:hover':{backgroundColor: alpha(theme.palette.success.main, 0.05)}}}>
                            <TrendingUpIcon sx={{mr:1}}/> Buy / Long
                        </ToggleButton>
                        <ToggleButton value="SELL" aria-label="sell side" sx={{flexGrow:1, '&.Mui-selected': {color: theme.palette.error.main, backgroundColor: alpha(theme.palette.error.main, 0.12)}, '&:hover':{backgroundColor: alpha(theme.palette.error.main, 0.05)}}}>
                            <TrendingDownIcon sx={{mr:1}}/> Sell / Short
                        </ToggleButton>
                    </ToggleButtonGroup>

                    <Stack direction={{xs: 'column', md: 'row'}} spacing={2}>
                        <TextField fullWidth label="Account Balance (USD)" value={accountBalance} onChange={e=> setAccountBalance(e.target.value)} type="number" sx={{flex:1}} InputProps={{ inputProps: { step: "100", min: "0" } }}/>
                        <TextField fullWidth label="Risk per Trade (%)" value={riskPercent} onChange={e => setRiskPercent(e.target.value)} type="number" sx={{flex:1}} InputProps={{ inputProps: { step: "0.1", min:"0.1", max:"100" } }}/>
                        <TextField fullWidth label="Leverage (x)" value={leverage} onChange={e => setLeverage(e.target.value)} type="number" sx={{flex:1}} InputProps={{ inputProps: { step: "1", min:"1", max:"125" } }}/>
                    </Stack>
                    <Stack direction={{xs: 'column', md: 'row'}} spacing={2}>
                        <TextField fullWidth label="Entry Price" value={entryPrice} onChange={e => setEntryPrice(e.target.value)} type="number" sx={{flex:1}} InputProps={{ inputProps: { step: "any", min: "0" } }}/>
                        <TextField fullWidth label="Stop Loss Price" value={stopLossPrice} onChange={e => setStopLossPrice(e.target.value)} type="number" sx={{flex:1}} InputProps={{ inputProps: { step: "any", min: "0" } }}/>
                        <TextField fullWidth label="Take Profit Price (Optional)" value={takeProfitPrice} onChange={e => setTakeProfitPrice(e.target.value)} type="number" sx={{flex:1}} InputProps={{ inputProps: { step: "any", min: "0" } }}/>
                    </Stack>
                    <Button variant="contained" color="primary" onClick={handleCalculateRisk} disabled={loadingRiskCalc} sx={{ mt: 2, mb:1, alignSelf: {xs: 'stretch', sm:'flex-start'} }}>
                        {loadingRiskCalc ? <CircularProgress size={24} color="inherit"/> : "Calculate Position"}
                    </Button>

                    {riskCalcError && <Typography color="error" sx={{mt:1, fontSize: '0.875rem'}}>{riskCalcError}</Typography>}

                    <Box sx={{mt: 1.5, p:2, border: `1px solid ${theme.palette.divider}`, borderRadius: 1, background: alpha(theme.palette.mode === 'dark' ? theme.palette.grey[800] : theme.palette.grey[100], 0.5)}}>
                        <Typography variant="subtitle1" component="h3" gutterBottom sx={{color: theme.palette.primary.main, fontWeight:'medium'}}>Calculation Results:</Typography>
                        <Stack spacing={0.8}>
                           <Typography>Position Size (Asset): <strong style={{color: theme.palette.text.primary}}>{positionSizeAsset}</strong></Typography>
                           <Typography>Position Size (USD): <strong style={{color: theme.palette.text.primary}}>{positionSizeUSD}</strong></Typography>
                           <Typography>Est. Potential Loss (on SL): <strong style={{color: theme.palette.error.main}}>{potentialLoss}</strong></Typography>
                           <Typography>Est. Potential Profit (on TP): <strong style={{color: theme.palette.success.main}}>{potentialProfit}</strong></Typography>
                           <Typography>Risk/Reward Ratio: <strong style={{color: theme.palette.text.primary}}>{riskRewardRatio}</strong></Typography>
                           <Typography>Est. Liquidation Price: <strong style={{color: theme.palette.warning.dark}}>{liquidationPrice}</strong></Typography>
                        </Stack>
                    </Box>
                </Stack>
            </Paper>
        </Container>
    );
};

export default DashboardPage;