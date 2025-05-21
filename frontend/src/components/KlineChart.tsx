// frontend/src/components/KlineChart.tsx
import React, { useEffect, useRef, memo } from 'react';
import {
  createChart,
  IChartApi,
  ISeriesApi,
  LineData,
  CandlestickData,
  HistogramData,
  UTCTimestamp,
  TimeScaleOptions,
  PriceScaleOptions,
} from 'lightweight-charts';
import { Box, Theme } from '@mui/material';

interface KlineChartProps {
  data: CandlestickData[];
  rsiData?: LineData[];
  ema9Data?: LineData[];
  ema21Data?: LineData[];
  ema50Data?: LineData[];
  ema200Data?: LineData[];
  macdLineData?: LineData[];
  macdSignalData?: LineData[];
  macdHistData?: HistogramData[];
  bollingerBandsData?: {
    upper: LineData[];
    middle: LineData[];
    lower: LineData[];
  };
  adxData?: LineData[];
  smaData?: LineData[];
  theme: Theme;
  height?: number;
  width?: number;
  showRSI?: boolean;
  showEMA9?: boolean;
  showEMA21?: boolean;
  showEMA50?: boolean;
  showEMA200?: boolean;
  showMACD?: boolean;
  showBollingerBands?: boolean;
  showADX?: boolean; // Assuming ADX might become a separate pane later
  showSMA?: boolean;
}

const KlineChart: React.FC<KlineChartProps> = ({
  data,
  rsiData,
  ema9Data,
  ema21Data,
  ema50Data,
  ema200Data,
  macdLineData,
  macdSignalData,
  macdHistData,
  bollingerBandsData,
  adxData,
  smaData,
  theme,
  height = 600,
  width,
  showRSI = true,
  showEMA9 = true,
  showEMA21 = true,
  showEMA50 = true,
  showEMA200 = true,
  showMACD = true,
  showBollingerBands = true,
  showADX = true, // If ADX becomes a separate pane, it needs to be in activeSeparatePanesConfig
  showSMA = true,
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);

  const rsiSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const ema9SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const ema21SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const ema50SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const ema200SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const macdLineSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const macdSignalSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const macdHistSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const bbUpperSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const bbMiddleSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const bbLowerSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const adxSeriesRef = useRef<ISeriesApi<'Line'> | null>(null); // Separate ref for ADX series
  const smaSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
    }

    const chart = createChart(chartContainerRef.current, {
      width: width || chartContainerRef.current.clientWidth,
      height: height,
      layout: {
        background: { color: theme.palette.background.paper },
        textColor: theme.palette.text.primary,
      },
      grid: {
        vertLines: { color: theme.palette.divider },
        horzLines: { color: theme.palette.divider },
      },
      crosshair: { mode: 1 },
      timeScale: {
        borderColor: theme.palette.divider,
        timeVisible: true,
        secondsVisible: false,
        fixLeftEdge: true,
        fixRightEdge: true,
      } as Partial<TimeScaleOptions>,
      rightPriceScale: {
        borderColor: theme.palette.divider,
        autoScale: true,
      } as Partial<PriceScaleOptions>,
    });
    chartRef.current = chart;

    candlestickSeriesRef.current = chart.addCandlestickSeries({
      upColor: theme.palette.success.main,
      downColor: theme.palette.error.main,
      borderDownColor: theme.palette.error.dark,
      borderUpColor: theme.palette.success.dark,
      wickDownColor: theme.palette.error.dark,
      wickUpColor: theme.palette.success.dark,
    });

    // Pane layout configuration
    const MAIN_PANE_MIN_HEIGHT_RATIO = 0.25; // Main chart should take at least 25%
    const INDICATOR_PANE_TOTAL_ALLOCATION_RATIO = 0.65; // Max 65% for all indicator panes
    const CHART_TOP_MARGIN_RATIO = 0.05;
    const CHART_BOTTOM_MARGIN_RATIO = 0.05;
    const GAP_BETWEEN_PANES_RATIO = 0.01;

    let activeSeparatePanesConfig: {
        key: string;
        priceScaleId: string;
        initFunctions: (()=>void)[]; // Functions to initialize series for this pane
    }[] = [];

    if (showRSI) {
      activeSeparatePanesConfig.push({
        key: 'rsi', priceScaleId: 'rsi-scale',
        initFunctions: [() => {
          rsiSeriesRef.current = chart.addLineSeries({ priceScaleId: 'rsi-scale', color: theme.palette.info.main, lineWidth: 1, title: 'RSI' });
        }]
      });
    }
    if (showMACD) {
      activeSeparatePanesConfig.push({
        key: 'macd', priceScaleId: 'macd-scale',
        initFunctions: [
          () => { macdLineSeriesRef.current = chart.addLineSeries({ priceScaleId: 'macd-scale', color: theme.palette.primary.main, lineWidth: 1, title: 'MACD Line' });},
          () => { macdSignalSeriesRef.current = chart.addLineSeries({ priceScaleId: 'macd-scale', color: theme.palette.warning.main, lineWidth: 1, title: 'Signal Line' });},
          () => { macdHistSeriesRef.current = chart.addHistogramSeries({ priceScaleId: 'macd-scale', base: 0, title: 'MACD Hist'});}
        ]
      });
    }
    // To make ADX a separate pane, add its config here:
    // if (showADX) {
    //   activeSeparatePanesConfig.push({
    //     key: 'adx', priceScaleId: 'adx-scale',
    //     initFunctions: [() => {
    //        adxSeriesRef.current = chart.addLineSeries({ priceScaleId: 'adx-scale', color: theme.palette.error.light, lineWidth: 1, title: 'ADX' });
    //     }]
    //   });
    // }


    const numIndicatorPanes = activeSeparatePanesConfig.length;
    let mainPaneActualBottomMargin; // This is the margin from the chart bottom for the main price scale

    if (numIndicatorPanes === 0) {
      mainPaneActualBottomMargin = CHART_BOTTOM_MARGIN_RATIO;
    } else {
      // Calculate total height needed for indicators including gaps and final bottom margin
      const totalGapsHeight = numIndicatorPanes * GAP_BETWEEN_PANES_RATIO;
      mainPaneActualBottomMargin = INDICATOR_PANE_TOTAL_ALLOCATION_RATIO + totalGapsHeight + CHART_BOTTOM_MARGIN_RATIO;
    }

    // Ensure main pane has minimum height
    if ((1.0 - CHART_TOP_MARGIN_RATIO - mainPaneActualBottomMargin) < MAIN_PANE_MIN_HEIGHT_RATIO) {
        mainPaneActualBottomMargin = 1.0 - CHART_TOP_MARGIN_RATIO - MAIN_PANE_MIN_HEIGHT_RATIO;
    }
    // Clamp mainPaneActualBottomMargin to avoid negative main pane height or exceeding 1 with top margin
    mainPaneActualBottomMargin = Math.max(CHART_BOTTOM_MARGIN_RATIO, Math.min(mainPaneActualBottomMargin, 1.0 - CHART_TOP_MARGIN_RATIO - 0.01));


    chart.priceScale('right').applyOptions({
      scaleMargins: {
        top: CHART_TOP_MARGIN_RATIO,
        bottom: mainPaneActualBottomMargin,
      }
    });

    let currentPaneDrawingStartAbsolute = 1.0 - mainPaneActualBottomMargin; // Top edge where the first indicator pane starts (from chart top 0.0)

    if (numIndicatorPanes > 0) {
      const totalNetHeightForIndicators = INDICATOR_PANE_TOTAL_ALLOCATION_RATIO; // Use the full allocation
      const heightPerIndicatorPaneNet = totalNetHeightForIndicators / numIndicatorPanes;

      for (const paneConfig of activeSeparatePanesConfig) {
        const paneTopAbsolute = currentPaneDrawingStartAbsolute;
        let paneBottomAbsoluteEdge = paneTopAbsolute + heightPerIndicatorPaneNet;

        // Ensure paneBottomAbsoluteEdge does not exceed 1.0 - CHART_BOTTOM_MARGIN_RATIO
        paneBottomAbsoluteEdge = Math.min(paneBottomAbsoluteEdge, 1.0 - CHART_BOTTOM_MARGIN_RATIO);
        // Ensure paneTopAbsolute is valid
        if (paneTopAbsolute < CHART_TOP_MARGIN_RATIO || paneTopAbsolute >= paneBottomAbsoluteEdge) {
            console.error("Invalid pane positioning for", paneConfig.key, {paneTopAbsolute, paneBottomAbsoluteEdge});
            continue; // Skip this pane if positioning is invalid
        }


        paneConfig.initFunctions.forEach(initFn => initFn());

        const scaleMarginBottom = 1.0 - paneBottomAbsoluteEdge;

        if (paneTopAbsolute < 0 || paneTopAbsolute > 1 || scaleMarginBottom < 0 || scaleMarginBottom > 1 || (paneTopAbsolute + scaleMarginBottom) >= 1.0) {
             console.error("Error setting scaleMargins for pane:", paneConfig.key,
                           "Calculated top:", paneTopAbsolute,
                           "Calculated bottom_margin:", scaleMarginBottom,
                           "Sum:", paneTopAbsolute + scaleMarginBottom);
        } else {
            chart.priceScale(paneConfig.priceScaleId).applyOptions({
                scaleMargins: {
                    top: paneTopAbsolute,
                    bottom: scaleMarginBottom,
                }
            });
        }
        currentPaneDrawingStartAbsolute = paneBottomAbsoluteEdge + GAP_BETWEEN_PANES_RATIO;
      }
    }

    // Initialize overlay series on the main pane ('right' priceScaleId)
    if(showEMA9) ema9SeriesRef.current = chart.addLineSeries({ color: '#FFD700', lineWidth: 1, title: 'EMA 9', priceScaleId: 'right' });
    if(showEMA21) ema21SeriesRef.current = chart.addLineSeries({ color: '#ADFF2F', lineWidth: 1, title: 'EMA 21', priceScaleId: 'right' });
    if(showEMA50) ema50SeriesRef.current = chart.addLineSeries({ color: '#00BFFF', lineWidth: 1, title: 'EMA 50', priceScaleId: 'right' });
    if(showEMA200) ema200SeriesRef.current = chart.addLineSeries({ color: '#FF69B4', lineWidth: 2, title: 'EMA 200', priceScaleId: 'right' });
    if(showBollingerBands) {
        bbUpperSeriesRef.current = chart.addLineSeries({ color: '#4682B4', lineWidth: 1, title: 'BB Upper', lastValueVisible: false, priceLineVisible: false, priceScaleId: 'right' });
        bbMiddleSeriesRef.current = chart.addLineSeries({ color: '#A9A9A9', lineWidth: 1, title: 'BB Middle', lastValueVisible: false, priceLineVisible: false, priceScaleId: 'right' });
        bbLowerSeriesRef.current = chart.addLineSeries({ color: '#4682B4', lineWidth: 1, title: 'BB Lower', lastValueVisible: false, priceLineVisible: false, priceScaleId: 'right' });
    }
    if(showSMA) smaSeriesRef.current = chart.addLineSeries({ color: '#DAA520', lineWidth: 1, title: 'SMA', priceScaleId: 'right' });

    // ADX is an overlay on main chart if not configured as a separate pane above
    if(showADX && !activeSeparatePanesConfig.find(p => p.key === 'adx')) {
        adxSeriesRef.current = chart.addLineSeries({ priceScaleId: 'right', color: theme.palette.error.light, lineWidth: 1, title: 'ADX'});
    }

    chart.timeScale().fitContent();

    return () => {
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  // Re-initialize chart if theme, dimensions, or pane structure changes.
  // Add showADX here IF it becomes a separately managed pane in activeSeparatePanesConfig.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme, height, width, showRSI, showMACD /*, showADX if separate pane */]);

  // Data setting and visibility management for all series
  useEffect(() => { if (candlestickSeriesRef.current && data) candlestickSeriesRef.current.setData(data);}, [data]);
  useEffect(() => { if (rsiSeriesRef.current) { rsiSeriesRef.current.setData(rsiData || []); rsiSeriesRef.current.applyOptions({visible: showRSI}); }}, [rsiData, showRSI]);
  useEffect(() => { if (ema9SeriesRef.current) { ema9SeriesRef.current.setData(ema9Data || []); ema9SeriesRef.current.applyOptions({visible: showEMA9}); }}, [ema9Data, showEMA9]);
  useEffect(() => { if (ema21SeriesRef.current) { ema21SeriesRef.current.setData(ema21Data || []); ema21SeriesRef.current.applyOptions({visible: showEMA21}); }}, [ema21Data, showEMA21]);
  useEffect(() => { if (ema50SeriesRef.current) { ema50SeriesRef.current.setData(ema50Data || []); ema50SeriesRef.current.applyOptions({visible: showEMA50}); }}, [ema50Data, showEMA50]);
  useEffect(() => { if (ema200SeriesRef.current) { ema200SeriesRef.current.setData(ema200Data || []); ema200SeriesRef.current.applyOptions({visible: showEMA200}); }}, [ema200Data, showEMA200]);

  useEffect(() => {
    const visible = showMACD;
    if (macdLineSeriesRef.current) { macdLineSeriesRef.current.setData(macdLineData || []); macdLineSeriesRef.current.applyOptions({visible});}
    if (macdSignalSeriesRef.current) { macdSignalSeriesRef.current.setData(macdSignalData || []); macdSignalSeriesRef.current.applyOptions({visible});}
    if (macdHistSeriesRef.current) {
        const themedMacdHistData = macdHistData?.map(d => ({...d, color: d.value >= 0 ? theme.palette.success.light : theme.palette.error.light })) || [];
        macdHistSeriesRef.current.setData(themedMacdHistData);
        macdHistSeriesRef.current.applyOptions({visible});
    }
  }, [macdLineData, macdSignalData, macdHistData, showMACD, theme]);

  useEffect(() => {
    const visible = showBollingerBands;
    if (bbUpperSeriesRef.current) { bbUpperSeriesRef.current.setData(bollingerBandsData?.upper || []); bbUpperSeriesRef.current.applyOptions({visible});}
    if (bbMiddleSeriesRef.current) { bbMiddleSeriesRef.current.setData(bollingerBandsData?.middle || []); bbMiddleSeriesRef.current.applyOptions({visible});}
    if (bbLowerSeriesRef.current) { bbLowerSeriesRef.current.setData(bollingerBandsData?.lower || []); bbLowerSeriesRef.current.applyOptions({visible});}
  }, [bollingerBandsData, showBollingerBands]);

  useEffect(() => { if (adxSeriesRef.current) { adxSeriesRef.current.setData(adxData || []); adxSeriesRef.current.applyOptions({visible: showADX}); }}, [adxData, showADX]);
  useEffect(() => { if (smaSeriesRef.current) { smaSeriesRef.current.setData(smaData || []); smaSeriesRef.current.applyOptions({visible: showSMA}); }}, [smaData, showSMA]);

  useEffect(() => {
    const handleResize = () => {
      if (chartRef.current && chartContainerRef.current) {
        chartRef.current.applyOptions({
          width: width || chartContainerRef.current.clientWidth,
          height: height,
        });
      }
    };
    window.addEventListener('resize', handleResize);
    if (!width && chartContainerRef.current) {
        handleResize();
    }
    return () => window.removeEventListener('resize', handleResize);
  }, [width, height]);

  return <Box ref={chartContainerRef} sx={{ position: 'relative', width: '100%', height: `${height}px` }} />;
};

export default memo(KlineChart);