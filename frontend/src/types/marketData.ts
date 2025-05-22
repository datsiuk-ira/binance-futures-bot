// frontend/src/types/marketData.ts

export interface Kline {
  timestamp: number; // Unix MS
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  signal?: 'BUY' | 'SELL' | 'HOLD'; // Added from backend
}

export interface RSIValues {
  [key: string]: (number | null)[]; // e.g., rsi_14: [45.0, 49.8, ...]
}

export interface EMAValues {
  [key: string]: (number | null)[]; // e.g., ema_9: [30100.0, 30150.0, ...]
}

export interface SMAValues {
  [key: string]: (number | null)[]; // e.g., sma_10: [30000.0, 30020.0, ...]
}

export interface MACDParams {
  params: string; // e.g., "12_26_9"
  macd_line: (number | null)[];
  signal_line: (number | null)[];
  histogram: (number | null)[];
}

export interface BollingerBandsParams {
  params: string; // e.g., "20_2.0"
  middle_band: (number | null)[];
  upper_band: (number | null)[];
  lower_band: (number | null)[];
}

export interface ADXValues {
  [key: string]: (number | null)[]; // e.g., adx_14, pdi_14, mdi_14
}

export interface TrendStatus {
  current_trend: 'UPTREND' | 'DOWNTREND' | 'FLAT' | 'UNDETERMINED';
  sma50_gt_sma200: boolean | null;
  details: string[]; // Full series of trend status
}

export interface VolatilityStatus {
  atr_percentage: (number | null)[];
  current_atr_percentage: number | null;
}

export interface IndicatorData {
  timestamps: number[];
  rsi?: RSIValues;
  ema?: EMAValues;
  sma?: SMAValues;
  macd?: MACDParams[];
  bollinger_bands?: BollingerBandsParams[];
  adx?: ADXValues;
  trend_status?: TrendStatus;
  volatility?: VolatilityStatus;
}

export interface MarketDataMessage {
  type: 'kline_with_indicators' | 'error'; // Added error type
  symbol: string;
  interval: string;
  klines: Kline[];
  indicators: IndicatorData;
  error?: string; // For error messages from backend
}

// For historical API endpoint
export interface HistoricalDataResponse {
    klines: Kline[];
    indicators: IndicatorData;
}