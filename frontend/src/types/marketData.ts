// frontend/src/types/marketData.ts

export interface Kline {
  timestamp: number; // Unix MS
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  signal?: 'BUY' | 'SELL' | 'HOLD';
}

export interface RSIValues {
  [key: string]: (number | null)[];
}

export interface EMAValues {
  [key: string]: (number | null)[];
}

export interface SMAValues {
  [key: string]: (number | null)[];
}

export interface MACDParams {
  params: string;
  macd_line: (number | null)[];
  signal_line: (number | null)[];
  histogram: (number | null)[];
}

export interface BollingerBandsParams {
  params: string;
  middle_band: (number | null)[];
  upper_band: (number | null)[];
  lower_band: (number | null)[];
}

export interface TrendStatus {
  current_trend: 'UPTREND' | 'DOWNTREND' | 'FLAT' | 'UNDETERMINED';
  sma50_gt_sma200: boolean | null;
  details: string[];
}

export interface VolatilityStatus {
  atr_percentage: (number | null)[];
  current_atr_percentage: number | null;
}

export interface IchimokuCloudData {
  tenkan_sen: (number | null)[];
  kijun_sen: (number | null)[];
  senkou_span_a: (number | null)[];
  senkou_span_b: (number | null)[];
  chikou_span: (number | null)[];
}

export interface FibonacciRetracementData {
  [levelKey: string]: (number | null)[]; // e.g., level_236, downtrend_level_382
}

export interface IndicatorData {
  timestamps: number[];
  rsi?: RSIValues;
  ema?: EMAValues;
  sma?: SMAValues;
  macd?: MACDParams[];
  bollinger_bands?: BollingerBandsParams[];
  adx_line?: (number | null)[];
  atr_line?: (number | null)[];
  vwap_line?: (number | null)[];
  ichimoku_cloud?: IchimokuCloudData;
  fibonacci_retracement?: FibonacciRetracementData;
  trend_status?: TrendStatus;
  volatility?: VolatilityStatus;
}

export interface MarketDataMessage {
  type: 'kline_with_indicators' | 'error' | 'subscription_ack' | 'connection_established' | 'pong';
  symbol: string;
  interval: string;
  klines: Kline[];
  indicators: IndicatorData;
  error?: string;
  message?: string;
}

export interface HistoricalDataResponse {
    klines: Kline[];
    indicators: IndicatorData;
    message?: string;
    error?: string;
}

export interface SignalData {
  signal: 'STRONG_BUY' | 'BUY' | 'HOLD' | 'SELL' | 'STRONG_SELL' | 'ERROR' | 'LOADING' | null;
  summary: string;
  confidence: number | null;
  details: Record<string, any>;
  error?: string;
}

export interface ArimaForecastData {
    historical_timestamps: number[];
    historical_values: (number | null)[];
    forecast_timestamps: number[];
    forecast_values: (number | null)[];
    conf_int_lower: (number | null)[];
    conf_int_upper: (number | null)[];
    used_order?: string | number[]; // (p,d,q) or "default"
    used_seasonal_order?: string | number[]; // (P,D,Q,s) or "default_or_none"
    forecast_steps?: number;
    message?: string;
}

export interface ArimaResponse extends ArimaForecastData {
    symbol?: string;
    interval?: string;
    error?: string;
}