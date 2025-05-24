import React, { useEffect, useRef, useState } from 'react';
import {
    createChart, IChartApi, ISeriesApi, CandlestickData, LineData, HistogramData, UTCTimestamp,
    CrosshairMode, PriceScaleMode, LineStyle, DeepPartial, ChartOptions, PriceScaleOptions,
    LogicalRangeChangeEventHandler, MouseEventParams // Corrected import
} from 'lightweight-charts';
import { Box, Paper } from '@mui/material';

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
}

interface KlineChartProps {
    data: ProcessedChartData[];
    height?: number;
    backgroundColor?: string;
    showMA?: boolean;
    showEMA?: boolean;
    showBollingerBands?: boolean;
    showMACD?: boolean;
    showRSI?: boolean;
}

// Оголошення `indicatorChartPriceScaleOptions` поза компонентом або в useCallback, якщо воно залежить від props
const defaultIndicatorChartPriceScaleOptions: DeepPartial<PriceScaleOptions> = {
    mode: PriceScaleMode.Normal,
    autoScale: true,
    borderColor: '#485c7b',
    scaleMargins: { top: 0.15, bottom: 0.15 },
};


const KlineChart: React.FC<KlineChartProps> = ({
    data,
    height = 700,
    backgroundColor = '#0d1117',
    showMA = true,
    showEMA = true,
    showBollingerBands = true,
    showMACD = true,
    showRSI = true,
}) => {
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const indicatorChartContainerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const indicatorChartRef = useRef<IChartApi | null>(null);

    const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
    const maSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
    const emaSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
    const bbUpperSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
    const bbMiddleSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
    const bbLowerSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);

    const macdLineSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
    const macdSignalSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
    const macdHistogramSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
    const rsiSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
    const rsiOverboughtLineRef = useRef<ReturnType<ISeriesApi<'Line'>['createPriceLine']> | null>(null);
    const rsiOversoldLineRef = useRef<ReturnType<ISeriesApi<'Line'>['createPriceLine']> | null>(null);


    const [tooltipContent, setTooltipContent] = useState<string | null>(null);
    const [tooltipVisible, setTooltipVisible] = useState(false);
    const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0, container: 'main' as 'main' | 'indicator' });

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

    // Використовуємо defaultIndicatorChartPriceScaleOptions, яке визначено вище
    const indicatorChartPriceScaleOptions = defaultIndicatorChartPriceScaleOptions;


    useEffect(() => {
        if (!chartContainerRef.current || !indicatorChartContainerRef.current ) {
            return;
        }
        if (data.length === 0 && chartRef.current) { // Clear charts if data becomes empty
             if (candlestickSeriesRef.current) candlestickSeriesRef.current.setData([]);
             // Remove other main chart series data if they exist
             if (maSeriesRef.current) maSeriesRef.current.setData([]);
             if (emaSeriesRef.current) emaSeriesRef.current.setData([]);
             if (bbUpperSeriesRef.current) bbUpperSeriesRef.current.setData([]);
             if (bbMiddleSeriesRef.current) bbMiddleSeriesRef.current.setData([]);
             if (bbLowerSeriesRef.current) bbLowerSeriesRef.current.setData([]);
        }
         if (data.length === 0 && indicatorChartRef.current) {
            if (macdLineSeriesRef.current) macdLineSeriesRef.current.setData([]);
            if (macdSignalSeriesRef.current) macdSignalSeriesRef.current.setData([]);
            if (macdHistogramSeriesRef.current) macdHistogramSeriesRef.current.setData([]);
            if (rsiSeriesRef.current) rsiSeriesRef.current.setData([]);
        }


        const mainChartHeight = Math.floor(height * 0.65);
        const indicatorChartHeight = Math.floor(height * 0.35);

        const chartOptions: DeepPartial<ChartOptions> = {
            width: chartContainerRef.current.clientWidth,
            height: mainChartHeight,
            layout: { background: { color: backgroundColor }, textColor: '#d1d4dc' },
            grid: { vertLines: { color: '#2A2E39' }, horzLines: { color: '#2A2E39' } },
            crosshair: { mode: CrosshairMode.Magnet },
            timeScale: { borderColor: '#485c7b', timeVisible: true, secondsVisible: false },
            rightPriceScale: commonPriceScaleOptions,
        };

        const indicatorChartOptions: DeepPartial<ChartOptions> = {
            width: indicatorChartContainerRef.current.clientWidth,
            height: indicatorChartHeight,
            layout: { background: { color: backgroundColor }, textColor: '#d1d4dc' },
            grid: { vertLines: { color: '#2A2E39' }, horzLines: { color: '#2A2E39' } },
            crosshair: { mode: CrosshairMode.Magnet },
            timeScale: { borderColor: '#485c7b', timeVisible: true, secondsVisible: false, visible: true },
        };


        if (!chartRef.current) {
            chartRef.current = createChart(chartContainerRef.current, chartOptions);
            candlestickSeriesRef.current = chartRef.current.addCandlestickSeries({
                upColor: '#26a69a', downColor: '#ef5350', borderVisible: false,
                wickUpColor: '#26a69a', wickDownColor: '#ef5350',
            });
        } else {
            chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth, height: mainChartHeight, layout: { background: { color: backgroundColor }}});
        }

        if (!indicatorChartRef.current) {
            indicatorChartRef.current = createChart(indicatorChartContainerRef.current, indicatorChartOptions);
        } else {
            indicatorChartRef.current.applyOptions({ width: indicatorChartContainerRef.current.clientWidth, height: indicatorChartHeight, layout: { background: { color: backgroundColor }}});
        }

        const mainChart = chartRef.current;
        const indicatorChart = indicatorChartRef.current;

        const mainTimeScale = mainChart.timeScale();
        const indicatorTimeScale = indicatorChart.timeScale();

        const debouncedSyncMainToIndicator: LogicalRangeChangeEventHandler = debounce(range => {
            if (range && indicatorChartRef.current) indicatorTimeScale.setVisibleLogicalRange(range);
        }, 20);
        const debouncedSyncIndicatorToMain: LogicalRangeChangeEventHandler = debounce(range => {
            if (range && chartRef.current) mainTimeScale.setVisibleLogicalRange(range);
        }, 20);

        mainTimeScale.subscribeVisibleLogicalRangeChange(debouncedSyncMainToIndicator);
        indicatorTimeScale.subscribeVisibleLogicalRangeChange(debouncedSyncIndicatorToMain);

        const crosshairMoveHandler = (param: MouseEventParams, chartType: 'main' | 'indicator') => {
            if (!param.time || !param.point) {
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
            if (chartType === 'main' && param.seriesData && param.seriesData.has(candlestickSeriesRef.current!)) {
                const candleData = param.seriesData.get(candlestickSeriesRef.current!) as CandlestickData<UTCTimestamp>;
                content = `<b>Price Chart</b><br/>Time: ${new Date((candleData.time as number) * 1000).toLocaleString()}<br/>
                           O: ${candleData.open.toFixed(2)}, H: ${candleData.high.toFixed(2)}, L: ${candleData.low.toFixed(2)}, C: ${candleData.close.toFixed(2)}<br/>`;
                if (showMA && pointData.ma !== undefined) content += `MA: ${pointData.ma.toFixed(2)}<br/>`;
                if (showEMA && pointData.ema !== undefined) content += `EMA: ${pointData.ema.toFixed(2)}<br/>`;
                if (showBollingerBands && pointData.bollingerBands) {
                    content += `BB: U ${pointData.bollingerBands.upper.toFixed(2)}, M ${pointData.bollingerBands.middle.toFixed(2)}, L ${pointData.bollingerBands.lower.toFixed(2)}<br/>`;
                }
                if (showMACD && pointData.macd) {
                    content += `MACD: ${pointData.macd.macd.toFixed(4)} Signal: ${pointData.macd.signal.toFixed(4)} Hist: ${pointData.macd.histogram.toFixed(4)}<br/>`;
                }
                if (showRSI && pointData.rsi !== undefined) {
                    content += `RSI: ${pointData.rsi.toFixed(2)}<br/>`;
                }
            } else if (chartType === 'indicator') {
                content = `<b>Indicator Chart</b><br/>Time: ${new Date((currentTimestamp as number) * 1000).toLocaleString()}<br/>`;
                const mainCandleForContext = data.find(d => d.time === currentTimestamp);
                 if (mainCandleForContext) {
                     content += `(Price C: ${mainCandleForContext.close.toFixed(2)})<br/>`;
                 }
                if (showMACD && pointData.macd) {
                    content += `MACD: ${pointData.macd.macd.toFixed(4)}<br/>Signal: ${pointData.macd.signal.toFixed(4)}<br/>Hist: ${pointData.macd.histogram.toFixed(4)}<br/>`;
                }
                if (showRSI && pointData.rsi !== undefined) {
                    content += `RSI: ${pointData.rsi.toFixed(2)}<br/>`;
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
            if (chartContainerRef.current && mainChart) {
                mainChart.applyOptions({ width: chartContainerRef.current.clientWidth });
            }
            if (indicatorChartContainerRef.current && indicatorChart) {
                indicatorChart.applyOptions({ width: indicatorChartContainerRef.current.clientWidth });
            }
        };
        window.addEventListener('resize', resizeHandler);

        return () => {
            window.removeEventListener('resize', resizeHandler);
            if (chartRef.current) {
                chartRef.current.timeScale().unsubscribeVisibleLogicalRangeChange(debouncedSyncMainToIndicator);
            }
            if (indicatorChartRef.current) {
                indicatorChartRef.current.timeScale().unsubscribeVisibleLogicalRangeChange(debouncedSyncIndicatorToMain);
            }
        };
    }, [height, backgroundColor, data, showMA, showEMA, showBollingerBands, showMACD, showRSI]);


    useEffect(() => {
        if (!chartRef.current || !candlestickSeriesRef.current ) return;
        const mainChart = chartRef.current;

        if (data.length === 0) {
            candlestickSeriesRef.current.setData([]);
            if (maSeriesRef.current) maSeriesRef.current.setData([]);
            if (emaSeriesRef.current) emaSeriesRef.current.setData([]);
            if (bbUpperSeriesRef.current) {
                bbUpperSeriesRef.current.setData([]);
                bbMiddleSeriesRef.current!.setData([]);
                bbLowerSeriesRef.current!.setData([]);
            }
            return;
        }


        candlestickSeriesRef.current.setData(data.map(item => ({
            time: item.time, open: item.open, high: item.high, low: item.low, close: item.close,
        } as CandlestickData<UTCTimestamp>)));

        if (showMA && data.some(d => d.ma !== undefined)) {
            if (!maSeriesRef.current) {
                maSeriesRef.current = mainChart.addLineSeries({ color: 'rgba(255, 193, 7, 0.8)', lineWidth: 2, priceLineVisible: false, lastValueVisible: false });
            }
            maSeriesRef.current.setData(data.filter(d => d.ma !== undefined).map(d => ({ time: d.time, value: d.ma! } as LineData<UTCTimestamp>)));
        } else if (maSeriesRef.current) {
            mainChart.removeSeries(maSeriesRef.current); maSeriesRef.current = null;
        }

        if (showEMA && data.some(d => d.ema !== undefined)) {
            if (!emaSeriesRef.current) {
                emaSeriesRef.current = mainChart.addLineSeries({ color: 'rgba(33, 150, 243, 0.8)', lineWidth: 2, priceLineVisible: false, lastValueVisible: false });
            }
            emaSeriesRef.current.setData(data.filter(d => d.ema !== undefined).map(d => ({ time: d.time, value: d.ema! } as LineData<UTCTimestamp>)));
        } else if (emaSeriesRef.current) {
            mainChart.removeSeries(emaSeriesRef.current); emaSeriesRef.current = null;
        }

        if (showBollingerBands && data.some(d => d.bollingerBands !== undefined)) {
            if (!bbUpperSeriesRef.current) {
                bbUpperSeriesRef.current = mainChart.addLineSeries({ color: 'rgba(156, 39, 176, 0.4)', lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
                bbMiddleSeriesRef.current = mainChart.addLineSeries({ color: 'rgba(156, 39, 176, 0.7)', lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
                bbLowerSeriesRef.current = mainChart.addLineSeries({ color: 'rgba(156, 39, 176, 0.4)', lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
            }
            bbUpperSeriesRef.current!.setData(data.filter(d => d.bollingerBands).map(d => ({ time: d.time, value: d.bollingerBands!.upper } as LineData<UTCTimestamp>)));
            bbMiddleSeriesRef.current!.setData(data.filter(d => d.bollingerBands).map(d => ({ time: d.time, value: d.bollingerBands!.middle } as LineData<UTCTimestamp>)));
            bbLowerSeriesRef.current!.setData(data.filter(d => d.bollingerBands).map(d => ({ time: d.time, value: d.bollingerBands!.lower } as LineData<UTCTimestamp>)));
        } else {
            if (bbUpperSeriesRef.current) { mainChart.removeSeries(bbUpperSeriesRef.current); bbUpperSeriesRef.current = null; }
            if (bbMiddleSeriesRef.current) { mainChart.removeSeries(bbMiddleSeriesRef.current); bbMiddleSeriesRef.current = null; }
            if (bbLowerSeriesRef.current) { mainChart.removeSeries(bbLowerSeriesRef.current); bbLowerSeriesRef.current = null; }
        }

        mainChart.timeScale().fitContent();
        mainChart.priceScale('right').applyOptions({ autoScale: true });

    }, [data, showMA, showEMA, showBollingerBands]);


    useEffect(() => {
        if (!indicatorChartRef.current) return;
        const indicatorChart = indicatorChartRef.current;

        if (data.length === 0) {
             if (macdLineSeriesRef.current) macdLineSeriesRef.current.setData([]);
             if (macdSignalSeriesRef.current) macdSignalSeriesRef.current.setData([]);
             if (macdHistogramSeriesRef.current) macdHistogramSeriesRef.current.setData([]);
             if (rsiSeriesRef.current) rsiSeriesRef.current.setData([]);
             return;
        }

        let macdTargetScaleId = 'left';
        let rsiTargetScaleId = 'left';

        let leftScaleVisible = false;
        let rightScaleVisible = false;

        if (showMACD && showRSI) {
            macdTargetScaleId = 'left';
            rsiTargetScaleId = 'right';
            leftScaleVisible = true;
            rightScaleVisible = true;
        } else if (showMACD) {
            macdTargetScaleId = 'left';
            leftScaleVisible = true;
        } else if (showRSI) {
            rsiTargetScaleId = 'left'; // RSI uses left if it's the only one
            leftScaleVisible = true;
        }

        indicatorChart.applyOptions({
            leftPriceScale: { ...indicatorChartPriceScaleOptions, visible: leftScaleVisible },
            rightPriceScale: { ...indicatorChartPriceScaleOptions, visible: rightScaleVisible }
        });

        // MACD
        if (showMACD && data.some(d => d.macd !== undefined)) {
            if (!macdLineSeriesRef.current) {
                macdLineSeriesRef.current = indicatorChart.addLineSeries({ color: 'rgba(0, 150, 136, 0.9)', lineWidth: 2, priceScaleId: macdTargetScaleId, title: 'MACD' });
                macdSignalSeriesRef.current = indicatorChart.addLineSeries({ color: 'rgba(255, 82, 82, 0.9)', lineWidth: 2, priceScaleId: macdTargetScaleId, title: 'Signal' });
                macdHistogramSeriesRef.current = indicatorChart.addHistogramSeries({ priceScaleId: macdTargetScaleId, base: 0, title: 'Histogram' });
            }
            macdLineSeriesRef.current!.setData(data.filter(d => d.macd).map(d => ({ time: d.time, value: d.macd!.macd } as LineData<UTCTimestamp>)));
            macdSignalSeriesRef.current!.setData(data.filter(d => d.macd).map(d => ({ time: d.time, value: d.macd!.signal } as LineData<UTCTimestamp>)));
            macdHistogramSeriesRef.current!.setData(data.filter(d => d.macd).map(d => ({
                time: d.time, value: d.macd!.histogram, color: d.macd!.histogram >= 0 ? 'rgba(38, 166, 154, 0.6)' : 'rgba(239, 83, 80, 0.6)'
            } as HistogramData<UTCTimestamp>)));

            if (leftScaleVisible && macdTargetScaleId === 'left') indicatorChart.priceScale('left').applyOptions({ autoScale: true });
            else if (rightScaleVisible && macdTargetScaleId === 'right') indicatorChart.priceScale('right').applyOptions({ autoScale: true });

        } else {
            if (macdLineSeriesRef.current) { indicatorChart.removeSeries(macdLineSeriesRef.current); macdLineSeriesRef.current = null; }
            if (macdSignalSeriesRef.current) { indicatorChart.removeSeries(macdSignalSeriesRef.current); macdSignalSeriesRef.current = null; }
            if (macdHistogramSeriesRef.current) { indicatorChart.removeSeries(macdHistogramSeriesRef.current); macdHistogramSeriesRef.current = null; }
        }

        // RSI
        if (showRSI && data.some(d => d.rsi !== undefined)) {
            if (!rsiSeriesRef.current) {
                rsiSeriesRef.current = indicatorChart.addLineSeries({ color: 'rgba(128, 0, 128, 0.9)', lineWidth: 2, priceScaleId: rsiTargetScaleId, title: 'RSI' });
                if (!rsiOverboughtLineRef.current && rsiSeriesRef.current) {
                    rsiOverboughtLineRef.current = rsiSeriesRef.current.createPriceLine({ price: 70, color: '#ef5350', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: '70' });
                }
                if (!rsiOversoldLineRef.current && rsiSeriesRef.current) {
                    rsiOversoldLineRef.current = rsiSeriesRef.current.createPriceLine({ price: 30, color: '#26a69a', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: '30' });
                }
            }
             rsiSeriesRef.current.setData(data.filter(d => d.rsi !== undefined).map(d => ({ time: d.time, value: d.rsi! } as LineData<UTCTimestamp>)));
             if (leftScaleVisible && rsiTargetScaleId === 'left') indicatorChart.priceScale('left').applyOptions({ autoScale: true });
             else if (rightScaleVisible && rsiTargetScaleId === 'right') indicatorChart.priceScale('right').applyOptions({ autoScale: true });
        } else {
            if (rsiSeriesRef.current) {
                if(rsiOverboughtLineRef.current && rsiSeriesRef.current) rsiSeriesRef.current.removePriceLine(rsiOverboughtLineRef.current);
                if(rsiOversoldLineRef.current && rsiSeriesRef.current) rsiSeriesRef.current.removePriceLine(rsiOversoldLineRef.current);
                rsiOverboughtLineRef.current = null;
                rsiOversoldLineRef.current = null;
                indicatorChart.removeSeries(rsiSeriesRef.current);
                rsiSeriesRef.current = null;
            }
        }
        indicatorChart.timeScale().fitContent();

    }, [data, showMACD, showRSI, indicatorChartPriceScaleOptions, height, backgroundColor]);

    const getTooltipLeft = (chartWidth: number | undefined, tooltipWidth: number, x: number) => {
        if (!chartWidth) return x + 20;
        const spaceRight = chartWidth - (x + 20);
        if (spaceRight < tooltipWidth) {
            return x - tooltipWidth - 20;
        }
        return x + 20;
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
                              `${getTooltipLeft(chartContainerRef.current.clientWidth, 250, tooltipPosition.x)}px` :
                              tooltipPosition.container === 'indicator' && indicatorChartContainerRef.current ?
                              `${getTooltipLeft(indicatorChartContainerRef.current.clientWidth, 250, tooltipPosition.x)}px` :
                              `${tooltipPosition.x + 20}px`,
                        top: tooltipPosition.container === 'main' ?
                             `${tooltipPosition.y + 20}px` :
                             `${tooltipPosition.y + 20 + (chartContainerRef.current?.clientHeight || 0)}px`,
                        minWidth: '220px',
                        maxWidth: '320px',
                        bgcolor: 'rgba(30, 35, 45, 0.92)',
                        color: '#e0e0e0',
                        padding: '12px',
                        borderRadius: '6px',
                        pointerEvents: 'none',
                        fontSize: '13px',
                        lineHeight: '1.7',
                        zIndex: 1001,
                        border: '1px solid rgba(80, 90, 110, 0.7)',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                    }}
                >
                 <div dangerouslySetInnerHTML={{ __html: tooltipContent }} />
                </Paper>
            )}
        </Box>
    );
};

export default KlineChart;