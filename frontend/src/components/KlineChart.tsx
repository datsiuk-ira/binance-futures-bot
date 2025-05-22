// frontend/src/components/KlineChart.tsx
import React, { useEffect, useRef, memo } from 'react';
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
  IPriceLine, // Import IPriceLine
  PriceLineOptions,
  SeriesType,
} from 'lightweight-charts';
import { Kline, IndicatorData, MACDParams, BollingerBandsParams } from '../types/marketData';

interface KlineChartProps {
  klines: Kline[];
  indicators: IndicatorData;
  symbol: string;
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
  return { time: (timestamp / 1000) as UTCTimestamp, value };
};

const formatHistogramData = (timestamp: number, value: number | null, color?: string): HistogramData<UTCTimestamp> | null => {
  if (value === null || isNaN(value)) return null;
  const dataPoint: HistogramData<UTCTimestamp> = { time: (timestamp / 1000) as UTCTimestamp, value };
  if (color) {
    dataPoint.color = color;
  }
  return dataPoint;
};

const KlineChart: React.FC<KlineChartProps> = ({ klines, indicators, chartLayoutOptions }) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);

  const indicatorSeriesRefs = useRef<Record<string, ISeriesApi<SeriesType>>>({});
  // Separate ref for price lines
  const priceLineRefs = useRef<Record<string, IPriceLine>>({});


  useEffect(() => {
    if (!chartContainerRef.current) return;

    if (!chartRef.current) {
      chartRef.current = createChart(chartContainerRef.current, {
        width: chartContainerRef.current.clientWidth,
        height: 500,
        layout: {
          background: { color: '#ffffff' },
          textColor: '#333333',
        },
        grid: {
          vertLines: { color: '#e1e1e1' },
          horzLines: { color: '#e1e1e1' },
        },
        crosshair: {
          mode: CrosshairMode.Normal,
        },
        timeScale: {
          borderColor: '#cccccc',
          timeVisible: true,
          secondsVisible: false,
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
      chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth });
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
            size: 1,
          });
        } else if (kline.signal === 'SELL') {
          markers.push({
            time: (kline.timestamp / 1000) as UTCTimestamp,
            position: 'aboveBar',
            color: 'red',
            shape: 'arrowDown',
            text: 'Sell',
            size: 1,
          });
        }
      });
      candlestickSeriesRef.current.setMarkers(markers);
    }

    const currentChart = chartRef.current;
    if (currentChart && indicators.timestamps && indicators.timestamps.length > 0) {
      const timestamps = indicators.timestamps;

      const manageLineSeries = (seriesKey: string, data: (number | null)[], color: string, pane?: number, lineStyle: LineStyle = LineStyle.Solid, lineWidth: 1 | 2 | 3 | 4 = 1) => {
        const seriesData = timestamps
          .map((ts, i) => formatLineData(ts, data[i]))
          .filter((d): d is LineData<UTCTimestamp> => d !== null);

        if (seriesData.length === 0) {
          if (indicatorSeriesRefs.current[seriesKey]) {
            currentChart.removeSeries(indicatorSeriesRefs.current[seriesKey]);
            delete indicatorSeriesRefs.current[seriesKey];
          }
          // Also remove any associated price lines if the main series is removed
          Object.keys(priceLineRefs.current).forEach(plKey => {
            if (plKey.startsWith(seriesKey + "_pl_")) { // Naming convention for associated price lines
                 // Price lines are removed from the series they belong to, not the chart directly.
                 // This part requires knowing which series the price line was attached to.
                 // For simplicity, we assume price lines are only on their specific series.
                 // If `indicatorSeriesRefs.current[seriesKey]` was the parent, its removal handles them,
                 // but direct management is better if they could be on other series.
                 // Here, we assume the series removal will also clear its price lines,
                 // but we must clear our refs.
                delete priceLineRefs.current[plKey];
            }
          });
          return;
        }

        if (indicatorSeriesRefs.current[seriesKey]) {
          indicatorSeriesRefs.current[seriesKey].setData(seriesData);
        } else {
          indicatorSeriesRefs.current[seriesKey] = currentChart.addLineSeries({
            color,
            lineWidth,
            lineStyle,
            lastValueVisible: true,
            priceLineVisible: false,
          });
          indicatorSeriesRefs.current[seriesKey].setData(seriesData);
        }
      };

      const manageHistogramSeries = (seriesKey: string, data: (number | null)[], basePane: number, positiveColor: string, negativeColor: string) => {
        const seriesData = timestamps
          .map((ts, i) => formatHistogramData(ts, data[i], data[i] !== null && data[i]! >= 0 ? positiveColor : negativeColor))
          .filter((d): d is HistogramData<UTCTimestamp> => d !== null);

        if (seriesData.length === 0) {
          if (indicatorSeriesRefs.current[seriesKey]) {
            currentChart.removeSeries(indicatorSeriesRefs.current[seriesKey]);
            delete indicatorSeriesRefs.current[seriesKey];
          }
          return;
        }
        if (indicatorSeriesRefs.current[seriesKey]) {
          indicatorSeriesRefs.current[seriesKey].setData(seriesData);
        } else {
          indicatorSeriesRefs.current[seriesKey] = currentChart.addHistogramSeries({
            lastValueVisible: true,
            priceLineVisible: false,
          });
          indicatorSeriesRefs.current[seriesKey].setData(seriesData);
        }
      };

      indicators.sma && Object.entries(indicators.sma).forEach(([key, data]) => {
        manageLineSeries(`sma_${key}`, data, '#FFD700', 0, LineStyle.Dotted, 1);
      });
      indicators.ema && Object.entries(indicators.ema).forEach(([key, data]) => {
        const color = key.includes('200') ? '#FF6347' : key.includes('50') ? '#4682B4' : '#FFA500';
        manageLineSeries(`ema_${key}`, data, color, 0, LineStyle.Solid, 1);
      });

      indicators.bollinger_bands?.forEach((bb: BollingerBandsParams, index: number) => {
        manageLineSeries(`bb_upper_${index}`, bb.upper_band, '#ADD8E6', 0, LineStyle.Dashed, 1);
        manageLineSeries(`bb_middle_${index}`, bb.middle_band, '#DDA0DD', 0, LineStyle.Dashed, 1);
        manageLineSeries(`bb_lower_${index}`, bb.lower_band, '#ADD8E6', 0, LineStyle.Dashed, 1);
      });

      indicators.rsi && Object.entries(indicators.rsi).forEach(([key, data]) => {
        const rsiSeriesKey = `rsi_${key}`;
        if (key === 'rsi_14') {
          manageLineSeries(rsiSeriesKey, data, '#9C27B0', 1, LineStyle.Solid, 2);
          const rsiPaneSeries = indicatorSeriesRefs.current[rsiSeriesKey] as ISeriesApi<'Line'> | undefined; // Cast to specific type

          if (rsiPaneSeries) {
            const pl70Key = `${rsiSeriesKey}_pl_70`; // Unique key for the price line
            const pl30Key = `${rsiSeriesKey}_pl_30`;

            if (!priceLineRefs.current[pl70Key]) {
              priceLineRefs.current[pl70Key] = rsiPaneSeries.createPriceLine({ price: 70, color: 'red', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: 'Overbought (70)' });
            } else {
                // Optionally update if needed, e.g. priceLineRefs.current[pl70Key].applyOptions({ price: 70, ... })
            }
            if (!priceLineRefs.current[pl30Key]) {
              priceLineRefs.current[pl30Key] = rsiPaneSeries.createPriceLine({ price: 30, color: 'green', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: 'Oversold (30)' });
            }
          }
        }
      });

      indicators.macd?.forEach((macdSet: MACDParams, index: number) => {
        if (index === 0) {
          manageLineSeries(`macd_line_${index}`, macdSet.macd_line, '#2196F3', 2, LineStyle.Solid, 2);
          manageLineSeries(`macd_signal_${index}`, macdSet.signal_line, '#FF9800', 2, LineStyle.Solid, 1);
          manageHistogramSeries(`macd_hist_${index}`, macdSet.histogram, 2, 'rgba(38,166,154,0.5)', 'rgba(239,83,80,0.5)');
        }
      });

      indicators.adx && Object.entries(indicators.adx).forEach(([key, data]) => {
        if (key.startsWith('adx_')) {
          manageLineSeries(`adx_line_${key}`, data, '#757575', 3, LineStyle.Solid, 2);
        } else if (key.startsWith('pdi_')) {
          manageLineSeries(`pdi_line_${key}`, data, '#4CAF50', 3, LineStyle.Solid, 1);
        } else if (key.startsWith('mdi_')) {
          manageLineSeries(`mdi_line_${key}`, data, '#F44336', 3, LineStyle.Solid, 1);
        }
      });

      const activeSeriesKeys = new Set<string>();
      if (indicators.sma) Object.keys(indicators.sma).forEach(k => activeSeriesKeys.add(`sma_${k}`));
      if (indicators.ema) Object.keys(indicators.ema).forEach(k => activeSeriesKeys.add(`ema_${k}`));
      if (indicators.bollinger_bands) indicators.bollinger_bands.forEach((_, i) => {
        activeSeriesKeys.add(`bb_upper_${i}`);
        activeSeriesKeys.add(`bb_middle_${i}`);
        activeSeriesKeys.add(`bb_lower_${i}`);
      });
      if (indicators.rsi) Object.keys(indicators.rsi).forEach(k => activeSeriesKeys.add(`rsi_${k}`));
      if (indicators.macd) indicators.macd.forEach((_, i) => {
        if (i === 0) {
          activeSeriesKeys.add(`macd_line_${i}`);
          activeSeriesKeys.add(`macd_signal_${i}`);
          activeSeriesKeys.add(`macd_hist_${i}`);
        }
      });
      if (indicators.adx) Object.keys(indicators.adx).forEach(k => {
        if (k.startsWith('adx_')) activeSeriesKeys.add(`adx_line_${k}`);
        else if (k.startsWith('pdi_')) activeSeriesKeys.add(`pdi_line_${k}`);
        else if (k.startsWith('mdi_')) activeSeriesKeys.add(`mdi_line_${k}`);
      });

      Object.keys(indicatorSeriesRefs.current).forEach(existingKey => {
        if (!activeSeriesKeys.has(existingKey)) {
          // Before removing the series, remove its associated price lines
          Object.keys(priceLineRefs.current).forEach(plKey => {
            if (plKey.startsWith(existingKey + "_pl_")) {
              const series = indicatorSeriesRefs.current[existingKey];
              if(series) { // Ensure series still exists before trying to remove its price line
                series.removePriceLine(priceLineRefs.current[plKey]);
              }
              delete priceLineRefs.current[plKey];
            }
          });
          currentChart.removeSeries(indicatorSeriesRefs.current[existingKey]);
          delete indicatorSeriesRefs.current[existingKey];
        }
      });
    }
  }, [klines, indicators, chartLayoutOptions]);

  useEffect(() => {
    const handleResize = () => {
      if (chartRef.current && chartContainerRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
        });
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    return () => {
      if (chartRef.current) {
        // Remove all series and their price lines before removing the chart
        Object.values(indicatorSeriesRefs.current).forEach(series => {
            // Iterating over priceLineRefs and removing them explicitly
            Object.entries(priceLineRefs.current).forEach(([plKey, priceLine]) => {
                // This check might be overly broad if price lines could be on candlestick series
                // Ideally, associate price lines with their parent series more directly if possible
                // For now, this attempts to remove all known price lines from any indicator series that might own them.
                // A safer way is if the series object itself could list its price lines.
                // Given the current structure, we iterate all and try to remove.
                try {
                    series.removePriceLine(priceLine); // This might error if priceLine isn't on THIS series
                } catch (e) { /* ignore if not on this series */ }
                delete priceLineRefs.current[plKey];
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

  return <div ref={chartContainerRef} style={{ width: '100%', height: '500px' }} />;
};

export default memo(KlineChart);