// frontend/src/components/KlineChart.tsx
import React, {useEffect, useRef, memo} from 'react';
import {
    createChart,
    IChartApi,
    ISeriesApi,
    CandlestickData,
    LineData,
    HistogramData,
    UTCTimestamp,
    LineStyle,
    CrosshairMode,
    SeriesMarker,
    Time,
    IPriceLine,
    PriceLineOptions,
    SeriesType,
} from 'lightweight-charts';
import {Kline, IndicatorData, MACDParams, BollingerBandsParams} from '../types/marketData'; // Assuming IndicatorData includes all possible indicators

interface KlineChartProps {
    klines: Kline[];
    indicators: IndicatorData | null; // Allow indicators to be null initially or if not available
    symbol: string; // For context or potential future use
    chartLayoutOptions?: Partial<Parameters<typeof createChart>[1]>;
}

const formatCandlestickData = (kline: Kline): CandlestickData<UTCTimestamp> => ({
    time: (kline.timestamp / 1000) as UTCTimestamp,
    open: kline.open,
    high: kline.high,
    low: kline.low,
    close: kline.close,
});

const formatLineData = (timestamp: number, value: number | null): LineData<UTCTimestamp> | null => {
    if (value === null || isNaN(value)) return null;
    return {time: (timestamp / 1000) as UTCTimestamp, value};
};

const formatHistogramData = (timestamp: number, value: number | null, color?: string): HistogramData<UTCTimestamp> | null => {
    if (value === null || isNaN(value)) return null;
    const dataPoint: HistogramData<UTCTimestamp> = {time: (timestamp / 1000) as UTCTimestamp, value};
    if (color) {
        dataPoint.color = color;
    }
    return dataPoint;
};

const KlineChart: React.FC<KlineChartProps> = ({klines, indicators, chartLayoutOptions}) => {
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
    const indicatorSeriesRefs = useRef<Record<string, ISeriesApi<SeriesType>>>({});
    const priceLineRefs = useRef<Record<string, IPriceLine>>({});

    useEffect(() => {
        if (!chartContainerRef.current) return;

        if (!chartRef.current) {
            chartRef.current = createChart(chartContainerRef.current, {
                width: chartContainerRef.current.clientWidth,
                height: 500, // Default height, can be overridden by props if needed
                layout: {
                    background: {color: '#ffffff'},
                    textColor: '#333333',
                },
                grid: {
                    vertLines: {color: '#e1e1e1'},
                    horzLines: {color: '#e1e1e1'},
                },
                crosshair: {
                    mode: CrosshairMode.Normal,
                },
                timeScale: {
                    borderColor: '#cccccc',
                    timeVisible: true,
                    secondsVisible: false, // Typically not needed for klines
                },
                ...chartLayoutOptions,
            });

            candlestickSeriesRef.current = chartRef.current.addCandlestickSeries({
                upColor: '#26a69a',
                downColor: '#ef5350',
                borderDownColor: '#ef5350',
                borderUpColor: '#26a69a',
                wickDownColor: '#ef5350',
                wickUpColor: '#26a69a',
            });
        } else {
            // Apply width update on existing chart if container size changed
            chartRef.current.applyOptions({width: chartContainerRef.current.clientWidth});
        }

        if (candlestickSeriesRef.current && klines.length > 0) {
            const formattedKlines = klines.map(formatCandlestickData);
            candlestickSeriesRef.current.setData(formattedKlines);

            const markers: SeriesMarker<Time>[] = [];
            klines.forEach(kline => {
                if (kline.signal === 'BUY') {
                    markers.push({
                        time: (kline.timestamp / 1000) as UTCTimestamp,
                        position: 'belowBar',
                        color: 'green',
                        shape: 'arrowUp',
                        text: 'Buy',
                        size: 1.2, // Slightly larger for visibility
                    });
                } else if (kline.signal === 'SELL') {
                    markers.push({
                        time: (kline.timestamp / 1000) as UTCTimestamp,
                        position: 'aboveBar',
                        color: 'red',
                        shape: 'arrowDown',
                        text: 'Sell',
                        size: 1.2, // Slightly larger for visibility
                    });
                }
            });
            candlestickSeriesRef.current.setMarkers(markers);
        } else if (candlestickSeriesRef.current) {
            candlestickSeriesRef.current.setData([]); // Clear data if klines are empty
            candlestickSeriesRef.current.setMarkers([]); // Clear markers
        }


        const currentChart = chartRef.current;
        if (currentChart && indicators && indicators.timestamps && indicators.timestamps.length > 0) {
            const timestamps = indicators.timestamps;

            const manageLineSeries = (
                seriesKey: string,
                data: (number | null)[] | undefined,
                color: string,
                pane?: number, // Pane is not directly used by lightweight-charts addLineSeries like this. Series are on main chart or separate price scales.
                lineStyle: LineStyle = LineStyle.Solid,
                lineWidth: 1 | 2 | 3 | 4 = 1
            ) => {
                if (!data) { // If data for this indicator is undefined, remove the series
                    if (indicatorSeriesRefs.current[seriesKey]) {
                        currentChart.removeSeries(indicatorSeriesRefs.current[seriesKey]);
                        delete indicatorSeriesRefs.current[seriesKey];
                    }
                    return;
                }
                const seriesData = timestamps
                    .map((ts, i) => formatLineData(ts, data[i]))
                    .filter((d): d is LineData<UTCTimestamp> => d !== null);

                if (seriesData.length === 0 && indicatorSeriesRefs.current[seriesKey]) {
                    currentChart.removeSeries(indicatorSeriesRefs.current[seriesKey]);
                    delete indicatorSeriesRefs.current[seriesKey];
                    return;
                }

                if (seriesData.length > 0) {
                    if (indicatorSeriesRefs.current[seriesKey]) {
                        indicatorSeriesRefs.current[seriesKey].setData(seriesData);
                    } else {
                        indicatorSeriesRefs.current[seriesKey] = currentChart.addLineSeries({
                            color,
                            lineWidth,
                            lineStyle,
                            lastValueVisible: true,
                            priceLineVisible: false, // Show price line label on y-axis
                            // pane: pane, // If using multi-pane setup, this would be relevant. For now, all on main chart.
                        });
                        indicatorSeriesRefs.current[seriesKey].setData(seriesData);
                    }
                }
            };

            const manageHistogramSeries = (
                seriesKey: string,
                data: (number | null)[] | undefined,
                // basePane: number, // Pane concept
                positiveColor: string,
                negativeColor: string
            ) => {
                if (!data) {
                    if (indicatorSeriesRefs.current[seriesKey]) {
                        currentChart.removeSeries(indicatorSeriesRefs.current[seriesKey]);
                        delete indicatorSeriesRefs.current[seriesKey];
                    }
                    return;
                }
                const seriesData = timestamps
                    .map((ts, i) => formatHistogramData(ts, data[i], data[i] !== null && data[i]! >= 0 ? positiveColor : negativeColor))
                    .filter((d): d is HistogramData<UTCTimestamp> => d !== null);

                if (seriesData.length === 0 && indicatorSeriesRefs.current[seriesKey]) {
                    currentChart.removeSeries(indicatorSeriesRefs.current[seriesKey]);
                    delete indicatorSeriesRefs.current[seriesKey];
                    return;
                }

                if (seriesData.length > 0) {
                    if (indicatorSeriesRefs.current[seriesKey]) {
                        indicatorSeriesRefs.current[seriesKey].setData(seriesData);
                    } else {
                        indicatorSeriesRefs.current[seriesKey] = currentChart.addHistogramSeries({
                            lastValueVisible: true,
                            priceLineVisible: false,
                            // pane: basePane, // if using panes
                        });
                        indicatorSeriesRefs.current[seriesKey].setData(seriesData);
                    }
                }
            };

            // SMA Series
            indicators.sma && Object.entries(indicators.sma).forEach(([key, data]) => {
                manageLineSeries(`sma_${key}`, data, '#FFD700', undefined, LineStyle.Dotted, 1);
            });

            // EMA Series
            indicators.ema && Object.entries(indicators.ema).forEach(([key, data]) => {
                const color = key.includes('200') ? '#FF6347' : key.includes('50') ? '#4682B4' : '#FFA500';
                manageLineSeries(`ema_${key}`, data, color, undefined, LineStyle.Solid, 1);
            });

            // Bollinger Bands Series
            indicators.bollinger_bands?.forEach((bb: BollingerBandsParams, index: number) => {
                manageLineSeries(`bb_upper_${bb.params || index}`, bb.upper_band, '#ADD8E6', undefined, LineStyle.Dashed, 1);
                manageLineSeries(`bb_middle_${bb.params || index}`, bb.middle_band, '#DDA0DD', undefined, LineStyle.Dashed, 1);
                manageLineSeries(`bb_lower_${bb.params || index}`, bb.lower_band, '#ADD8E6', undefined, LineStyle.Dashed, 1);
            });

            // RSI Series
            indicators.rsi && Object.entries(indicators.rsi).forEach(([key, data]) => {
                const rsiSeriesKey = `rsi_${key}`;
                // Assuming only one primary RSI series is plotted, others could be variations
                manageLineSeries(rsiSeriesKey, data, '#9C27B0', undefined, LineStyle.Solid, 2);

                const rsiPaneSeries = indicatorSeriesRefs.current[rsiSeriesKey] as ISeriesApi<'Line'> | undefined;
                if (rsiPaneSeries) {
                    const plKeys = [`${rsiSeriesKey}_pl_70`, `${rsiSeriesKey}_pl_30`];
                    const plOptions: PriceLineOptions[] = [
                        {
                            price: 70,
                            color: 'red',
                            lineWidth: 1,
                            lineStyle: LineStyle.Dashed,
                            axisLabelVisible: true,
                            title: 'Overbought (70)',
                            lineVisible: true,
                            axisLabelColor: 'red',
                            axisLabelTextColor: 'white'
                        },
                        {
                            price: 30,
                            color: 'green',
                            lineWidth: 1,
                            lineStyle: LineStyle.Dashed,
                            axisLabelVisible: true,
                            title: 'Oversold (30)',
                            lineVisible: true,
                            axisLabelColor: 'green',
                            axisLabelTextColor: 'white'
                        }
                    ];


                    plKeys.forEach((plKey, idx) => {
                        if (priceLineRefs.current[plKey]) { // Remove old if exists to re-add, or applyOptions
                            try {
                                rsiPaneSeries.removePriceLine(priceLineRefs.current[plKey]);
                            } catch (e) {/*ignore*/
                            }
                        }
                        priceLineRefs.current[plKey] = rsiPaneSeries.createPriceLine(plOptions[idx]);
                    });
                }
            });

            // MACD Series
            indicators.macd?.forEach((macdSet: MACDParams, index: number) => {
                // Typically only one set of MACD is shown on a chart pane
                const macdKey = `macd_line_${macdSet.params || index}`;
                const signalKey = `macd_signal_${macdSet.params || index}`;
                const histKey = `macd_hist_${macdSet.params || index}`;

                manageLineSeries(macdKey, macdSet.macd_line, '#2196F3', undefined, LineStyle.Solid, 2);
                manageLineSeries(signalKey, macdSet.signal_line, '#FF9800', undefined, LineStyle.Solid, 1);
                manageHistogramSeries(histKey, macdSet.histogram, 'rgba(38,166,154,0.5)', 'rgba(239,83,80,0.5)');
            });

            // ADX Series
            indicators.adx && Object.entries(indicators.adx).forEach(([key, data]) => {
                if (key.startsWith('adx_')) {
                    manageLineSeries(`adx_line_${key}`, data, '#757575', undefined, LineStyle.Solid, 2);
                } else if (key.startsWith('pdi_')) {
                    manageLineSeries(`pdi_line_${key}`, data, '#4CAF50', undefined, LineStyle.Solid, 1);
                } else if (key.startsWith('mdi_')) {
                    manageLineSeries(`mdi_line_${key}`, data, '#F44336', undefined, LineStyle.Solid, 1);
                }
            });

            // Cleanup: Remove series for indicators that are no longer present in the `indicators` object
            const activeSeriesKeys = new Set<string>();
            if (indicators.sma) Object.keys(indicators.sma).forEach(k => activeSeriesKeys.add(`sma_${k}`));
            if (indicators.ema) Object.keys(indicators.ema).forEach(k => activeSeriesKeys.add(`ema_${k}`));
            if (indicators.bollinger_bands) indicators.bollinger_bands.forEach((bb, i) => {
                activeSeriesKeys.add(`bb_upper_${bb.params || i}`);
                activeSeriesKeys.add(`bb_middle_${bb.params || i}`);
                activeSeriesKeys.add(`bb_lower_${bb.params || i}`);
            });
            if (indicators.rsi) Object.keys(indicators.rsi).forEach(k => activeSeriesKeys.add(`rsi_${k}`));
            if (indicators.macd) indicators.macd.forEach((macdSet, i) => {
                activeSeriesKeys.add(`macd_line_${macdSet.params || i}`);
                activeSeriesKeys.add(`macd_signal_${macdSet.params || i}`);
                activeSeriesKeys.add(`macd_hist_${macdSet.params || i}`);
            });
            if (indicators.adx) Object.keys(indicators.adx).forEach(k => {
                if (k.startsWith('adx_')) activeSeriesKeys.add(`adx_line_${k}`);
                else if (k.startsWith('pdi_')) activeSeriesKeys.add(`pdi_line_${k}`);
                else if (k.startsWith('mdi_')) activeSeriesKeys.add(`mdi_line_${k}`);
            });

            Object.keys(indicatorSeriesRefs.current).forEach(existingKey => {
                if (!activeSeriesKeys.has(existingKey)) {
                    // Remove associated price lines first
                    Object.keys(priceLineRefs.current).forEach(plKey => {
                        if (plKey.startsWith(existingKey + "_pl_")) { // Check if price line belongs to this series
                            const series = indicatorSeriesRefs.current[existingKey];
                            if (series && series.seriesType() === 'Line') { // Ensure series exists and can have price lines
                                try {
                                    (series as ISeriesApi<'Line'>).removePriceLine(priceLineRefs.current[plKey]);
                                } catch (e) { /* ignore if not on this series or already removed */
                                }
                            }
                            delete priceLineRefs.current[plKey];
                        }
                    });
                    currentChart.removeSeries(indicatorSeriesRefs.current[existingKey]);
                    delete indicatorSeriesRefs.current[existingKey];
                }
            });
        } else if (currentChart) { // No indicators or empty timestamps, remove all indicator series
            Object.keys(indicatorSeriesRefs.current).forEach(existingKey => {
                Object.keys(priceLineRefs.current).forEach(plKey => {
                    if (plKey.startsWith(existingKey + "_pl_")) {
                        const series = indicatorSeriesRefs.current[existingKey];
                        if (series && series.seriesType() === 'Line') {
                            try {
                                (series as ISeriesApi<'Line'>).removePriceLine(priceLineRefs.current[plKey]);
                            } catch (e) {
                            }
                        }
                        delete priceLineRefs.current[plKey];
                    }
                });
                currentChart.removeSeries(indicatorSeriesRefs.current[existingKey]);
                delete indicatorSeriesRefs.current[existingKey];
            });
            indicatorSeriesRefs.current = {}; // Reset refs
            priceLineRefs.current = {};
        }

    }, [klines, indicators, chartLayoutOptions]); // Dependencies

    useEffect(() => {
        const handleResize = () => {
            if (chartRef.current && chartContainerRef.current) {
                chartRef.current.applyOptions({
                    width: chartContainerRef.current.clientWidth,
                    // height: chartContainerRef.current.clientHeight, // Or fixed height
                });
            }
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        // Cleanup on component unmount
        return () => {
            if (chartRef.current) {
                // Explicitly remove all series and their price lines
                Object.values(indicatorSeriesRefs.current).forEach(series => {
                    Object.values(priceLineRefs.current).forEach(priceLine => {
                        // Attempt to remove, catching errors if price line doesn't belong to this specific series
                        // or if series type doesn't support price lines (though we check for Line type above for adding)
                        try {
                            if (series.seriesType() === 'Line') { // Check if it's a line series
                                (series as ISeriesApi<'Line'>).removePriceLine(priceLine);
                            }
                        } catch (e) { /* ignore */
                        }
                    });
                    chartRef.current?.removeSeries(series);
                });
                if (candlestickSeriesRef.current) {
                    chartRef.current?.removeSeries(candlestickSeriesRef.current);
                }
                chartRef.current.remove();
                chartRef.current = null;
                candlestickSeriesRef.current = null;
                indicatorSeriesRefs.current = {};
                priceLineRefs.current = {};
            }
        };
    }, []);

    return <div ref={chartContainerRef} style={{width: '100%', height: '500px'}}/>;
};

export default memo(KlineChart);