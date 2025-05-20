// frontend/src/components/KlineChart.tsx
import React, { useEffect, useRef, memo } from 'react';
import {
  createChart, IChartApi, ISeriesApi, CandlestickData, UTCTimestamp,
  ChartOptions, DeepPartial, SeriesOptionsMap, ColorType,
} from 'lightweight-charts';
import { KlineData as HistoricalKlineData } from '../api/marketDataService';

interface KlineChartProps {
  data: HistoricalKlineData[]; // Historical data from initial fetch
  lastCandleUpdate?: CandlestickData | null;
  height?: number;
}

const mapHistoricalDataToCandlestick = (kline: HistoricalKlineData): CandlestickData => {
  const timeInSeconds = Number(kline.open_time) / 1000;
  return {
    time: timeInSeconds as UTCTimestamp,
    open: parseFloat(kline.open),
    high: parseFloat(kline.high),
    low: parseFloat(kline.low),
    close: parseFloat(kline.close),
  };
};

const KlineChart: React.FC<KlineChartProps> = ({ data, lastCandleUpdate, height = 450 }) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<IChartApi | null>(null);
  const seriesInstanceRef = useRef<ISeriesApi<'Candlestick'> | null>(null);

  // Effect for chart creation and resize setup
  useEffect(() => {
    if (!chartContainerRef.current) return;

    if (!chartInstanceRef.current) {
      const chartOptions: DeepPartial<ChartOptions> = { /* ... ваші опції ... */
        width: chartContainerRef.current.clientWidth, height: height,
        layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: '#D1D4DC' },
        grid: { vertLines: { color: 'rgba(70, 130, 180, 0.5)' }, horzLines: { color: 'rgba(70, 130, 180, 0.5)' } },
        timeScale: { timeVisible: true, secondsVisible: false, borderColor: 'rgba(70, 130, 180, 0.8)' },
        crosshair: { mode: 0 },
        rightPriceScale: { borderColor: 'rgba(70, 130, 180, 0.8)' },
      };
      const newChart: IChartApi = createChart(chartContainerRef.current, chartOptions);
      chartInstanceRef.current = newChart;

      const seriesOptions: DeepPartial<SeriesOptionsMap['Candlestick']> = { /* ... ваші опції серії ... */
        upColor: '#FF9800', downColor: '#2196F3',
        borderVisible: false, wickUpColor: '#FF9800', wickDownColor: '#2196F3',
      };
      seriesInstanceRef.current = newChart.addCandlestickSeries(seriesOptions);
    }

    const currentChartContainer = chartContainerRef.current;
    const handleResize = () => {
      if (chartInstanceRef.current && currentChartContainer) {
        chartInstanceRef.current.resize(currentChartContainer.clientWidth, height);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => { window.removeEventListener('resize', handleResize); };
  }, [height]); // Only height as dependency for creation/main resize logic


  // Effect for setting/updating historical data
  useEffect(() => {
    if (seriesInstanceRef.current) {
      if (data && data.length > 0) {
        const mappedHistoricalData = data.map(mapHistoricalDataToCandlestick).sort((a, b) => Number(a.time) - Number(b.time));
        seriesInstanceRef.current.setData(mappedHistoricalData);
        console.log(`KlineChart: Historical data (re)set with ${mappedHistoricalData.length} items.`);
        if (chartInstanceRef.current) {
            chartInstanceRef.current.timeScale().fitContent();
        }
      } else {
        seriesInstanceRef.current.setData([]); // Clear chart if no historical data
        console.log('KlineChart: Historical data cleared due to empty data prop.');
      }
    }
  }, [data]); // Runs when historical data array changes


  // Effect for applying real-time WebSocket updates
  useEffect(() => {
    if (seriesInstanceRef.current && lastCandleUpdate) {
      console.log('KlineChart: Applying real-time update via series.update():', lastCandleUpdate);
      seriesInstanceRef.current.update(lastCandleUpdate);
    }
  }, [lastCandleUpdate]); // Runs when a new WS update arrives

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.remove();
        chartInstanceRef.current = null;
        seriesInstanceRef.current = null;
      }
    };
  }, []);

  return <div ref={chartContainerRef} style={{ width: '100%', height: `${height}px` }} />;
};

export default memo(KlineChart);