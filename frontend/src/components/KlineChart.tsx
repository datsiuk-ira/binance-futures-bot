// frontend/src/components/KlineChart.tsx
import React, { useEffect, useRef, useState } from 'react';
import {
    createChart, IChartApi, ISeriesApi, CandlestickData, LineData, HistogramData, UTCTimestamp,
    CrosshairMode, PriceScaleMode, LineStyle, DeepPartial, ChartOptions, PriceScaleOptions, ColorType,
    LogicalRangeChangeEventHandler, MouseEventParams, AreaSeriesPartialOptions, LineSeriesPartialOptions,
    HistogramSeriesPartialOptions,
    PriceLineOptions // Ensure PriceLineOptions is imported
} from 'lightweight-charts';
import { Box, Paper } from '@mui/material';
import {ArimaResponse} from "../types/marketData";

export interface ProcessedChartData {
    time: UTCTimestamp;
    open: number;
    high: number;
    low: number;
    close: number;
    ma?: number;
    ema?: number;
    bollingerBands?: { upper: number; middle: number; lower: number };
    macd?: { macd: number; signal: number; histogram: number };
    rsi?: number;
    adx?: number;
    atr?: number;
    vwap?: number;
    ichimokuCloud?: {
        tenkan?: number;
        kijun?: number;
        senkouA?: number;
        senkouB?: number;
        chikou?: number;
    };
    fibonacciRetracement?: { [levelKey: string]: number };
}

interface KlineChartProps {
    data: ProcessedChartData[];
    interval: string; // Added interval prop
    height?: number;
    backgroundColor?: string;
    showMA?: boolean;
    showEMA?: boolean;
    showBollingerBands?: boolean;
    showMACD?: boolean;
    showRSI?: boolean;
    showADX?: boolean;
    showATR?: boolean;
    showIchimoku?: boolean;
    showFibonacci?: boolean;
    showVWAP?: boolean;
    arimaData?: ArimaResponse | null;
    showARIMA?: boolean;
}

const defaultIndicatorChartPriceScaleOptions: DeepPartial<PriceScaleOptions> = {
    mode: PriceScaleMode.Normal,
    autoScale: true,
    borderColor: '#485c7b',
    scaleMargins: { top: 0.1, bottom: 0.05 },
};

const ichimokuColors = {
    tenkan: 'rgba(0, 150, 243, 0.9)',
    kijun: 'rgba(255, 64, 129, 0.9)',
    senkouA: 'rgba(76, 175, 80, 0.5)',
    senkouB: 'rgba(244, 67, 54, 0.5)',
    chikou: 'rgba(255, 160, 0, 0.8)',
    kumoUp: 'rgba(76, 175, 80, 0.15)',
    kumoDown: 'rgba(244, 67, 54, 0.15)',
};


const KlineChart: React.FC<KlineChartProps> = ({
    data,
    interval, // Destructure interval prop
    height = 700,
    backgroundColor = '#0d1117',
    showMA = true,
    showEMA = true,
    showBollingerBands = true,
    showMACD = true,
    showRSI = true,
    showADX = true,
    showATR = false,
    showIchimoku = true,
    showFibonacci = false,
    showVWAP = true,
    arimaData = null,
    showARIMA = true,
}) => {
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const indicatorChartContainerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const indicatorChartRef = useRef<IChartApi | null>(null);

    // Main chart series refs
    const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
    const maSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
    const emaSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
    const bbUpperSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
    const bbMiddleSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
    const bbLowerSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
    const vwapSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
    const tenkanSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
    const kijunSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
    const senkouASeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
    const senkouBSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
    const chikouSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
    const fibonacciLinesRef = useRef<Record<string, ReturnType<ISeriesApi<'Line'>['createPriceLine']>>>({});

    // Indicator chart series refs
    const macdLineSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
    const macdSignalSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
    const macdHistogramSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
    const rsiSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
    const rsiOverboughtLineRef = useRef<ReturnType<ISeriesApi<'Line'>['createPriceLine']> | null>(null);
    const rsiOversoldLineRef = useRef<ReturnType<ISeriesApi<'Line'>['createPriceLine']> | null>(null);
    const adxSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
    const atrSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);

    const [tooltipContent, setTooltipContent] = useState<string | null>(null);
    const [tooltipVisible, setTooltipVisible] = useState(false);
    const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0, container: 'main' as 'main' | 'indicator' });

    const arimaForecastSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
    const arimaLowerBoundSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
    const arimaUpperBoundSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);

    // Moved syncLock ref to the top level of the component
    const syncLock = useRef(false);

    const debounce = <F extends (...args: any[]) => any>(func: F, delay: number) => {
        let timeoutId: ReturnType<typeof setTimeout>;
        return (...args: Parameters<F>): void => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => func(...args), delay);
        };
    };

    const commonPriceScaleOptions: DeepPartial<PriceScaleOptions> = {
        borderColor: '#485c7b',
        autoScale: true,
    };
    const indicatorChartPriceScaleOptions = defaultIndicatorChartPriceScaleOptions;

    // Main useEffect for chart creation and core event handling
    useEffect(() => {
        if (!chartContainerRef.current || !indicatorChartContainerRef.current ) return;

        const mainChartHeight = Math.floor(height * 0.65);
        const indicatorChartHeight = Math.floor(height * 0.35);

        const chartOptions: DeepPartial<ChartOptions> = {
            width: chartContainerRef.current.clientWidth, height: mainChartHeight,
            layout: { background: { type: ColorType.Solid, color: backgroundColor }, textColor: '#d1d4dc' },
            grid: { vertLines: { color: '#2A2E39' }, horzLines: { color: '#2A2E39' } },
            crosshair: { mode: CrosshairMode.Magnet },
            timeScale: { borderColor: '#485c7b', timeVisible: true, secondsVisible: interval === '1m' }, // Use interval prop
            rightPriceScale: commonPriceScaleOptions,
        };

        const indicatorChartOptions: DeepPartial<ChartOptions> = {
            width: indicatorChartContainerRef.current.clientWidth, height: indicatorChartHeight,
            layout: { background: { type: ColorType.Solid, color: backgroundColor }, textColor: '#d1d4dc' },
            grid: { vertLines: { color: '#2A2E39' }, horzLines: { color: '#2A2E39' } },
            crosshair: { mode: CrosshairMode.Magnet },
            timeScale: { borderColor: '#485c7b', timeVisible: true, secondsVisible: interval === '1m', visible: true }, // Use interval prop
        };

        if (!chartRef.current) {
            chartRef.current = createChart(chartContainerRef.current, chartOptions);
            candlestickSeriesRef.current = chartRef.current.addCandlestickSeries({
                upColor: '#26a69a', downColor: '#ef5350', borderVisible: false,
                wickUpColor: '#26a69a', wickDownColor: '#ef5350',
            });
        } else {
            chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth, height: mainChartHeight, layout: { background: { type: ColorType.Solid, color: backgroundColor }}});
        }

        if (!indicatorChartRef.current) {
            indicatorChartRef.current = createChart(indicatorChartContainerRef.current, indicatorChartOptions);
        } else {
            indicatorChartRef.current.applyOptions({ width: indicatorChartContainerRef.current.clientWidth, height: indicatorChartHeight, layout: { background: { type: ColorType.Solid, color: backgroundColor }}});
        }

        const mainChart = chartRef.current;
        const indicatorChart = indicatorChartRef.current;

        const mainTimeScale = mainChart.timeScale();
        const indicatorTimeScale = indicatorChart.timeScale();

        const syncMainToIndicator: LogicalRangeChangeEventHandler = debounce(range => {
            if (syncLock.current) return;
            if (range && indicatorChartRef.current) {
                syncLock.current = true;
                indicatorTimeScale.setVisibleLogicalRange(range);
                setTimeout(() => syncLock.current = false, 0);
            }
        }, 20);
        const syncIndicatorToMain: LogicalRangeChangeEventHandler = debounce(range => {
            if (syncLock.current) return;
            if (range && chartRef.current) {
                syncLock.current = true;
                mainTimeScale.setVisibleLogicalRange(range);
                setTimeout(() => syncLock.current = false, 0);
            }
        }, 20);

        mainTimeScale.subscribeVisibleLogicalRangeChange(syncMainToIndicator);
        indicatorTimeScale.subscribeVisibleLogicalRangeChange(syncIndicatorToMain);

        const crosshairMoveHandler = (param: MouseEventParams, chartType: 'main' | 'indicator') => {
            if (!param.time || !param.point || !param.seriesData) {
                 if ((tooltipPosition.container === chartType && tooltipVisible) || (chartType === 'main' && tooltipVisible) ){
                    setTooltipVisible(false);
                 }
                 return;
            }

            const currentTimestamp = param.time as UTCTimestamp;
            const pointData = data.find(d => d.time === currentTimestamp);

            if (!pointData) {
                setTooltipVisible(false);
                return;
            }

            let content = '';
            const formatVal = (val: number | undefined, dp = 2) => val !== undefined ? val.toFixed(dp) : 'N/A';

            if (chartType === 'main') {
                const candleSeries = candlestickSeriesRef.current;
                if (candleSeries && param.seriesData.has(candleSeries)) {
                    const candleData = param.seriesData.get(candleSeries) as CandlestickData<UTCTimestamp>;
                    content = `<b>Price Chart</b><br/>Time: ${new Date((candleData.time as number) * 1000).toLocaleString()}<br/>
                               O: ${formatVal(candleData.open)}, H: ${formatVal(candleData.high)}, L: ${formatVal(candleData.low)}, C: ${formatVal(candleData.close)}<br/>`;
                } else {
                     content = `<b>Main Chart</b><br/>Time: ${new Date((currentTimestamp as number) * 1000).toLocaleString()}<br/>C: ${formatVal(pointData.close)}<br/>`
                }

                if (showMA && pointData.ma !== undefined) content += `MA: ${formatVal(pointData.ma)}<br/>`;
                if (showEMA && pointData.ema !== undefined) content += `EMA: ${formatVal(pointData.ema)}<br/>`;
                if (showBollingerBands && pointData.bollingerBands) {
                    content += `BB: U ${formatVal(pointData.bollingerBands.upper)}, M ${formatVal(pointData.bollingerBands.middle)}, L ${formatVal(pointData.bollingerBands.lower)}<br/>`;
                }
                if (showVWAP && pointData.vwap !== undefined) content += `VWAP: ${formatVal(pointData.vwap)}<br/>`;
                if (showIchimoku && pointData.ichimokuCloud) {
                    const ic = pointData.ichimokuCloud;
                    content += `Tenkan: ${formatVal(ic.tenkan)} Kijun: ${formatVal(ic.kijun)}<br/>`
                    content += `SenkouA: ${formatVal(ic.senkouA)} SenkouB: ${formatVal(ic.senkouB)}<br/>`
                    content += `Chikou: ${formatVal(ic.chikou)}<br/>`;
                }
                if (showFibonacci && pointData.fibonacciRetracement) {
                    content += `Fib Levels (last):<br/>`;
                     Object.entries(pointData.fibonacciRetracement).forEach(([key, val]) => {
                         content += `  ${key.replace(/_/g, ' ')}: ${formatVal(val)}<br/>`;
                     });
                }

            } else if (chartType === 'indicator') {
                content = `<b>Indicator Chart</b><br/>Time: ${new Date((currentTimestamp as number) * 1000).toLocaleString()}<br/>(Price C: ${formatVal(pointData.close)})<br/>`;
                if (showMACD && pointData.macd) {
                    content += `MACD: ${formatVal(pointData.macd.macd, 4)} Signal: ${formatVal(pointData.macd.signal, 4)} Hist: ${formatVal(pointData.macd.histogram, 4)}<br/>`;
                }
                if (showRSI && pointData.rsi !== undefined) {
                    content += `RSI: ${formatVal(pointData.rsi)}<br/>`;
                }
                if (showADX && pointData.adx !== undefined) {
                    content += `ADX: ${formatVal(pointData.adx)}<br/>`;
                }
                if (showATR && pointData.atr !== undefined) {
                    content += `ATR: ${formatVal(pointData.atr, 4)}<br/>`;
                }
            }

            if (content && param.point) {
                setTooltipContent(content);
                setTooltipVisible(true);
                setTooltipPosition({ x: param.point.x, y: param.point.y, container: chartType });
            } else {
                setTooltipVisible(false);
            }
        };

        mainChart.subscribeCrosshairMove(param => crosshairMoveHandler(param as MouseEventParams, 'main'));
        indicatorChart.subscribeCrosshairMove(param => crosshairMoveHandler(param as MouseEventParams, 'indicator'));

        const resizeHandler = () => {
            if (chartContainerRef.current && mainChart) mainChart.applyOptions({ width: chartContainerRef.current.clientWidth });
            if (indicatorChartContainerRef.current && indicatorChart) indicatorChart.applyOptions({ width: indicatorChartContainerRef.current.clientWidth });
        };
        window.addEventListener('resize', resizeHandler);

        return () => {
            window.removeEventListener('resize', resizeHandler);
            if (mainChart) mainChart.timeScale().unsubscribeVisibleLogicalRangeChange(syncMainToIndicator);
            if (indicatorChart) indicatorChart.timeScale().unsubscribeVisibleLogicalRangeChange(syncIndicatorToMain);
        };
    }, [height, backgroundColor, data, interval, showMA, showEMA, showBollingerBands, showVWAP, showIchimoku, showFibonacci, showMACD, showRSI, showADX, showATR, arimaData, showARIMA]);


    // Effect for Main Chart Series Data
    useEffect(() => {
        if (!chartRef.current || !candlestickSeriesRef.current ) return;
        const mainChart = chartRef.current;

        const candlestickData = data.map(item => ({ time: item.time, open: item.open, high: item.high, low: item.low, close: item.close } as CandlestickData<UTCTimestamp>));
        candlestickSeriesRef.current.setData(candlestickData);

        if (showMA && data.some(d => d.ma !== undefined)) {
            if (!maSeriesRef.current) maSeriesRef.current = mainChart.addLineSeries({ color: 'rgba(255, 193, 7, 0.8)', lineWidth: 2, priceLineVisible: false, lastValueVisible: false, title: 'MA' });
            maSeriesRef.current.setData(data.filter(d => d.ma !== undefined).map(d => ({ time: d.time, value: d.ma! })));
        } else if (maSeriesRef.current) { mainChart.removeSeries(maSeriesRef.current); maSeriesRef.current = null; }

        if (showEMA && data.some(d => d.ema !== undefined)) {
            if (!emaSeriesRef.current) emaSeriesRef.current = mainChart.addLineSeries({ color: 'rgba(33, 150, 243, 0.8)', lineWidth: 2, priceLineVisible: false, lastValueVisible: false, title: 'EMA' });
            emaSeriesRef.current.setData(data.filter(d => d.ema !== undefined).map(d => ({ time: d.time, value: d.ema! })));
        } else if (emaSeriesRef.current) { mainChart.removeSeries(emaSeriesRef.current); emaSeriesRef.current = null; }

        if (showBollingerBands && data.some(d => d.bollingerBands !== undefined)) {
            if (!bbUpperSeriesRef.current) {
                bbUpperSeriesRef.current = mainChart.addLineSeries({ color: 'rgba(156, 39, 176, 0.4)', lineWidth: 1, priceLineVisible: false, lastValueVisible: false, title: 'BB Up' });
                bbMiddleSeriesRef.current = mainChart.addLineSeries({ color: 'rgba(156, 39, 176, 0.7)', lineWidth: 1, priceLineVisible: false, lastValueVisible: false, title: 'BB Mid' });
                bbLowerSeriesRef.current = mainChart.addLineSeries({ color: 'rgba(156, 39, 176, 0.4)', lineWidth: 1, priceLineVisible: false, lastValueVisible: false, title: 'BB Low' });
            }
            bbUpperSeriesRef.current!.setData(data.filter(d => d.bollingerBands).map(d => ({ time: d.time, value: d.bollingerBands!.upper })));
            bbMiddleSeriesRef.current!.setData(data.filter(d => d.bollingerBands).map(d => ({ time: d.time, value: d.bollingerBands!.middle })));
            bbLowerSeriesRef.current!.setData(data.filter(d => d.bollingerBands).map(d => ({ time: d.time, value: d.bollingerBands!.lower })));
        } else {
            [bbUpperSeriesRef, bbMiddleSeriesRef, bbLowerSeriesRef].forEach(ref => { if (ref.current) { mainChart.removeSeries(ref.current); ref.current = null; }});
        }

        if (showVWAP && data.some(d => d.vwap !== undefined)) {
            if (!vwapSeriesRef.current) vwapSeriesRef.current = mainChart.addLineSeries({ color: 'rgba(255, 100, 0, 0.8)', lineWidth: 2, priceLineVisible: false, lastValueVisible: false, title: 'VWAP' });
            vwapSeriesRef.current.setData(data.filter(d => d.vwap !== undefined).map(d => ({ time: d.time, value: d.vwap! })));
        } else if (vwapSeriesRef.current) { mainChart.removeSeries(vwapSeriesRef.current); vwapSeriesRef.current = null; }

        const ichimokuVisible = showIchimoku && data.some(d => d.ichimokuCloud && (d.ichimokuCloud.tenkan !== undefined || d.ichimokuCloud.kijun !== undefined));
        if (ichimokuVisible) {
            if (!tenkanSeriesRef.current) tenkanSeriesRef.current = mainChart.addLineSeries({ color: ichimokuColors.tenkan, lineWidth: 1, title: 'Tenkan', priceLineVisible: false, lastValueVisible: false });
            if (!kijunSeriesRef.current) kijunSeriesRef.current = mainChart.addLineSeries({ color: ichimokuColors.kijun, lineWidth: 1, title: 'Kijun', priceLineVisible: false, lastValueVisible: false });
            if (!senkouASeriesRef.current) senkouASeriesRef.current = mainChart.addLineSeries({ color: ichimokuColors.senkouA, lineWidth: 1, title: 'Senkou A', priceLineVisible: false, lastValueVisible: false });
            if (!senkouBSeriesRef.current) senkouBSeriesRef.current = mainChart.addLineSeries({ color: ichimokuColors.senkouB, lineWidth: 1, title: 'Senkou B', priceLineVisible: false, lastValueVisible: false });
            if (!chikouSeriesRef.current) chikouSeriesRef.current = mainChart.addLineSeries({ color: ichimokuColors.chikou, lineWidth: 1, lineStyle: LineStyle.Dashed, title: 'Chikou', priceLineVisible: false, lastValueVisible: false });

            tenkanSeriesRef.current.setData(data.filter(d => d.ichimokuCloud?.tenkan !== undefined).map(d => ({ time: d.time, value: d.ichimokuCloud!.tenkan! })));
            kijunSeriesRef.current.setData(data.filter(d => d.ichimokuCloud?.kijun !== undefined).map(d => ({ time: d.time, value: d.ichimokuCloud!.kijun! })));
            senkouASeriesRef.current.setData(data.filter(d => d.ichimokuCloud?.senkouA !== undefined).map(d => ({ time: d.time, value: d.ichimokuCloud!.senkouA! })));
            senkouBSeriesRef.current.setData(data.filter(d => d.ichimokuCloud?.senkouB !== undefined).map(d => ({ time: d.time, value: d.ichimokuCloud!.senkouB! })));
            chikouSeriesRef.current.setData(data.filter(d => d.ichimokuCloud?.chikou !== undefined).map(d => ({ time: d.time, value: d.ichimokuCloud!.chikou! })));

        } else {
            [tenkanSeriesRef, kijunSeriesRef, senkouASeriesRef, senkouBSeriesRef, chikouSeriesRef].forEach(ref => {
                if (ref.current) { mainChart.removeSeries(ref.current); ref.current = null; }
            });
        }

        if (candlestickSeriesRef.current) {
            Object.values(fibonacciLinesRef.current).forEach(line => candlestickSeriesRef.current?.removePriceLine(line));
        }
        fibonacciLinesRef.current = {};
        if (showFibonacci && data.length > 0 && candlestickSeriesRef.current) {
            const lastPointWithFib = [...data].reverse().find(d => d.fibonacciRetracement && Object.keys(d.fibonacciRetracement).length > 0);
            if (lastPointWithFib && lastPointWithFib.fibonacciRetracement) {
                Object.entries(lastPointWithFib.fibonacciRetracement).forEach(([key, price]) => {
                    if (price !== undefined && candlestickSeriesRef.current) {
                        try {
                             fibonacciLinesRef.current[key] = candlestickSeriesRef.current.createPriceLine({
                                price: price,
                                color: key.includes('downtrend') ? 'rgba(255, 82, 82, 0.6)' : 'rgba(76, 175, 80, 0.6)',
                                lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: true,
                                title: key.replace(/_/g, ' ').replace(/(level |downtrend level )/gi, '').substring(0,5),
                            });
                        } catch (e) {
                            console.error("Error creating Fibonacci price line:", e);
                        }
                    }
                });
            }
        }
        if (data.length > 0) mainChart.timeScale().fitContent();

        // ARIMA Forecast
        if (showARIMA && arimaData && arimaData.forecast_values && arimaData.forecast_timestamps) {
            const forecastLineData: LineData<UTCTimestamp>[] = arimaData.forecast_timestamps.map((ts, idx) => ({
                time: (ts / 1000) as UTCTimestamp, // Переконайтеся, що час у секундах
                value: arimaData.forecast_values[idx] as number,
            })).filter(item => item.value !== null && item.value !== undefined);

            const lowerBoundData: LineData<UTCTimestamp>[] = arimaData.forecast_timestamps.map((ts, idx) => ({
                time: (ts / 1000) as UTCTimestamp,
                value: arimaData.conf_int_lower[idx] as number,
            })).filter(item => item.value !== null && item.value !== undefined);

            const upperBoundData: LineData<UTCTimestamp>[] = arimaData.forecast_timestamps.map((ts, idx) => ({
                time: (ts / 1000) as UTCTimestamp,
                value: arimaData.conf_int_upper[idx] as number,
            })).filter(item => item.value !== null && item.value !== undefined);

            if (!arimaForecastSeriesRef.current) {
                arimaForecastSeriesRef.current = mainChart.addLineSeries({
                    color: 'rgba(255, 215, 0, 0.8)', // Gold
                    lineWidth: 2,
                    lineStyle: LineStyle.Dashed,
                    title: 'ARIMA Forecast',
                    priceLineVisible: false,
                    lastValueVisible: true,
                });
            }
            if (forecastLineData.length > 0) arimaForecastSeriesRef.current.setData(forecastLineData);
            else arimaForecastSeriesRef.current.setData([]);


            if (arimaData.conf_int_lower && arimaData.conf_int_upper) {
                if (!arimaLowerBoundSeriesRef.current) {
                    arimaLowerBoundSeriesRef.current = mainChart.addLineSeries({
                        color: 'rgba(211, 211, 211, 0.4)', // Light gray, transparent
                        lineWidth: 1,
                        lineStyle: LineStyle.Dotted,
                        title: 'ARIMA Lower CI',
                        priceLineVisible: false, lastValueVisible: false,
                    });
                }
                 if (lowerBoundData.length > 0) arimaLowerBoundSeriesRef.current.setData(lowerBoundData);
                 else arimaLowerBoundSeriesRef.current.setData([]);


                if (!arimaUpperBoundSeriesRef.current) {
                    arimaUpperBoundSeriesRef.current = mainChart.addLineSeries({
                        color: 'rgba(211, 211, 211, 0.4)', // Light gray, transparent
                        lineWidth: 1,
                        lineStyle: LineStyle.Dotted,
                        title: 'ARIMA Upper CI',
                        priceLineVisible: false, lastValueVisible: false,
                    });
                }
                 if (upperBoundData.length > 0) arimaUpperBoundSeriesRef.current.setData(upperBoundData);
                 else arimaUpperBoundSeriesRef.current.setData([]);
            }

        } else {
            if (arimaForecastSeriesRef.current) { mainChart.removeSeries(arimaForecastSeriesRef.current); arimaForecastSeriesRef.current = null; }
            if (arimaLowerBoundSeriesRef.current) { mainChart.removeSeries(arimaLowerBoundSeriesRef.current); arimaLowerBoundSeriesRef.current = null; }
            if (arimaUpperBoundSeriesRef.current) { mainChart.removeSeries(arimaUpperBoundSeriesRef.current); arimaUpperBoundSeriesRef.current = null; }
        }

        if (data.length > 0 || (arimaData && arimaData.forecast_values)) { // Перевіряємо наявність будь-яких даних для масштабування
            mainChart.timeScale().fitContent();
        }

    }, [data, showMA, showEMA, showBollingerBands, showVWAP, showIchimoku, showFibonacci, backgroundColor, arimaData, showARIMA]);


    // Effect for Indicator Chart Series Data
    useEffect(() => {
        if (!indicatorChartRef.current) return;
        const indicatorChart = indicatorChartRef.current;

        let leftScaleUsed = false;
        let rightScaleUsed = false;
        let assignedScalesThisRun: Record<string, 'left' | 'right'> = {};

        const setupIndicator = (
            show: boolean,
            dataCheck: (d: ProcessedChartData) => boolean,
            seriesRef: React.MutableRefObject<ISeriesApi<'Line'> | ISeriesApi<'Histogram'> | null>,
            seriesOptions: DeepPartial<LineSeriesPartialOptions | HistogramSeriesPartialOptions>,
            dataMap: (d: ProcessedChartData) => LineData<UTCTimestamp> | HistogramData<UTCTimestamp>,
            scalePreference: 'left' | 'right' = 'left',
            lines?: { ref: React.MutableRefObject<ReturnType<ISeriesApi<'Line'>['createPriceLine']> | null>, options: PriceLineOptions }[]
        ) => {
            let targetScaleId: 'left' | 'right' = scalePreference;
            const seriesTitle = seriesOptions.title || 'untitled_indicator_' + Math.random();

            if (show && data.some(dataCheck)) {
                 if (assignedScalesThisRun[seriesTitle]) {
                    targetScaleId = assignedScalesThisRun[seriesTitle];
                 } else if (scalePreference === 'left' && !leftScaleUsed) {
                    leftScaleUsed = true; targetScaleId = 'left';
                 } else if (scalePreference === 'right' && !rightScaleUsed) {
                    rightScaleUsed = true; targetScaleId = 'right';
                 } else if (!leftScaleUsed) {
                    leftScaleUsed = true; targetScaleId = 'left';
                 } else if (!rightScaleUsed) {
                    rightScaleUsed = true; targetScaleId = 'right';
                 } else {
                    targetScaleId = 'left';
                 }
                 assignedScalesThisRun[seriesTitle] = targetScaleId;


                if (!seriesRef.current) {
                    if ('base' in seriesOptions) {
                         seriesRef.current = indicatorChart.addHistogramSeries({ ...seriesOptions, priceScaleId: targetScaleId } as HistogramSeriesPartialOptions);
                    } else {
                         seriesRef.current = indicatorChart.addLineSeries({ ...seriesOptions, priceScaleId: targetScaleId } as LineSeriesPartialOptions);
                    }
                } else {
                     (seriesRef.current as ISeriesApi<'Line' | 'Histogram'>).applyOptions({ priceScaleId: targetScaleId });
                }
                seriesRef.current!.setData(data.filter(dataCheck).map(dataMap));

                if (lines && seriesRef.current && seriesRef.current.seriesType() === 'Line') {
                    lines.forEach(lineInfo => {
                        if (lineInfo.ref.current) {
                            try {(seriesRef.current as ISeriesApi<'Line'>).removePriceLine(lineInfo.ref.current);} catch(e){}
                            lineInfo.ref.current = null;
                        }
                        if (seriesRef.current?.seriesType() === 'Line') {
                           lineInfo.ref.current = (seriesRef.current as ISeriesApi<'Line'>).createPriceLine(lineInfo.options);
                        }
                    });
                }
            } else if (seriesRef.current) {
                if (lines && seriesRef.current && seriesRef.current.seriesType() === 'Line') {
                     lines.forEach(lineInfo => {
                        if (lineInfo.ref.current) {
                            try { (seriesRef.current as ISeriesApi<'Line'>).removePriceLine(lineInfo.ref.current); } catch(e){}
                            lineInfo.ref.current = null;
                        }
                     });
                }
                indicatorChart.removeSeries(seriesRef.current); seriesRef.current = null;
            }
        };

        const macdDataCheck = (d: ProcessedChartData) => d.macd !== undefined;
        if (showMACD && data.some(macdDataCheck)) {
            let macdScale = assignedScalesThisRun['MACD_L'] || (!leftScaleUsed ? 'left' : !rightScaleUsed ? 'right' : 'left');
            if (macdScale === 'left' && !assignedScalesThisRun['MACD_L']) leftScaleUsed = true;
            else if (macdScale === 'right' && !assignedScalesThisRun['MACD_L']) rightScaleUsed = true;
            assignedScalesThisRun['MACD_L'] = macdScale; assignedScalesThisRun['MACD_S'] = macdScale; assignedScalesThisRun['MACD_H'] = macdScale;

            if (!macdLineSeriesRef.current) macdLineSeriesRef.current = indicatorChart.addLineSeries({ color: 'rgba(0, 150, 136, 0.9)', lineWidth: 2, priceScaleId: macdScale, title: 'MACD' });
            else macdLineSeriesRef.current.applyOptions({priceScaleId: macdScale});
            macdLineSeriesRef.current.setData(data.filter(macdDataCheck).map(d => ({ time: d.time, value: d.macd!.macd })));

            if (!macdSignalSeriesRef.current) macdSignalSeriesRef.current = indicatorChart.addLineSeries({ color: 'rgba(255, 82, 82, 0.9)', lineWidth: 2, priceScaleId: macdScale, title: 'Signal' });
            else macdSignalSeriesRef.current.applyOptions({priceScaleId: macdScale});
            macdSignalSeriesRef.current.setData(data.filter(macdDataCheck).map(d => ({ time: d.time, value: d.macd!.signal })));

            if (!macdHistogramSeriesRef.current) macdHistogramSeriesRef.current = indicatorChart.addHistogramSeries({ priceScaleId: macdScale, base: 0, title: 'Histogram' });
            else macdHistogramSeriesRef.current.applyOptions({priceScaleId: macdScale});
            macdHistogramSeriesRef.current.setData(data.filter(macdDataCheck).map(d => ({ time: d.time, value: d.macd!.histogram, color: d.macd!.histogram >= 0 ? 'rgba(38, 166, 154, 0.6)' : 'rgba(239, 83, 80, 0.6)'})));
        } else {
            [macdLineSeriesRef, macdSignalSeriesRef, macdHistogramSeriesRef].forEach(ref => { if (ref.current) { indicatorChart.removeSeries(ref.current); ref.current = null; }});
        }

        setupIndicator(showRSI, d => d.rsi !== undefined, rsiSeriesRef,
            { color: 'rgba(128, 0, 128, 0.9)', lineWidth: 2, title: 'RSI' },
            d => ({ time: d.time, value: d.rsi! }),
            (leftScaleUsed && assignedScalesThisRun['MACD_L'] === 'left' && !rightScaleUsed) ? 'right' : 'left',
            [
                { ref: rsiOverboughtLineRef, options: {
                        price: 70,
                        color: '#ef5350',
                        lineWidth: 1,
                        lineStyle: LineStyle.Dashed,
                        axisLabelVisible: true,
                        title: '70',
                        lineVisible: false,
                        axisLabelColor: '',
                        axisLabelTextColor: ''
                    } },
                { ref: rsiOversoldLineRef, options: {
                        price: 30,
                        color: '#26a69a',
                        lineWidth: 1,
                        lineStyle: LineStyle.Dashed,
                        axisLabelVisible: true,
                        title: '30',
                        lineVisible: false,
                        axisLabelColor: '',
                        axisLabelTextColor: ''
                    } }
            ]
        );

        setupIndicator(showADX, d => d.adx !== undefined, adxSeriesRef,
            { color: 'rgba(255, 165, 0, 0.9)', lineWidth: 2, title: 'ADX' },
            d => ({ time: d.time, value: d.adx! }),
            (!leftScaleUsed ? 'left' : !rightScaleUsed ? 'right' : 'right')
        );

        setupIndicator(showATR, d => d.atr !== undefined, atrSeriesRef,
            { color: 'rgba(100, 100, 255, 0.9)', lineWidth: 1, title: 'ATR' },
            d => ({ time: d.time, value: d.atr! }),
             (!leftScaleUsed ? 'left' : !rightScaleUsed ? 'right' : 'right')
        );

        indicatorChart.applyOptions({
            leftPriceScale: { ...indicatorChartPriceScaleOptions, visible: leftScaleUsed },
            rightPriceScale: { ...indicatorChartPriceScaleOptions, visible: rightScaleUsed }
        });
        if (data.length > 0) indicatorChart.timeScale().fitContent();

    }, [data, showMACD, showRSI, showADX, showATR, backgroundColor]);


    const getTooltipLeft = (chartWidth: number | undefined, tooltipWidth: number, x: number) => {
        if (!chartWidth) return x + 20;
        const spaceRight = chartWidth - (x + 20);
        return (spaceRight < tooltipWidth) ? (x - tooltipWidth - 20) : (x + 20);
    };

    return (
        <Box sx={{ position: 'relative', backgroundColor }}>
            <Box ref={chartContainerRef} sx={{ width: '100%' }} />
            <Box ref={indicatorChartContainerRef} sx={{ width: '100%', marginTop: '1px' }} />
            {tooltipVisible && tooltipContent && (
                <Paper
                    elevation={4}
                    sx={{
                        position: 'absolute',
                        left: tooltipPosition.container === 'main' && chartContainerRef.current ?
                              `${getTooltipLeft(chartContainerRef.current.clientWidth, 280, tooltipPosition.x)}px` :
                              tooltipPosition.container === 'indicator' && indicatorChartContainerRef.current ?
                              `${getTooltipLeft(indicatorChartContainerRef.current.clientWidth, 280, tooltipPosition.x)}px` :
                              `${tooltipPosition.x + 20}px`,
                        top: tooltipPosition.container === 'main' ?
                             `${tooltipPosition.y + 20}px` :
                             `${tooltipPosition.y + 20 + (chartContainerRef.current?.clientHeight || 0)}px`,
                        minWidth: '240px',
                        maxWidth: '350px',
                        bgcolor: 'rgba(30, 35, 45, 0.95)',
                        color: '#e0e0e0',
                        padding: '12px',
                        borderRadius: '8px',
                        pointerEvents: 'none',
                        fontSize: '12.5px',
                        lineHeight: '1.6',
                        zIndex: 1001,
                        border: '1px solid rgba(80, 90, 110, 0.7)',
                        boxShadow: '0 6px 15px rgba(0,0,0,0.45)',
                    }}
                >
                 <div dangerouslySetInnerHTML={{ __html: tooltipContent }} />
                </Paper>
            )}
        </Box>
    );
};

export default KlineChart;