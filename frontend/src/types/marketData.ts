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
  timestamps: number[]; // Timestamps corresponding to the indicator values arrays
  rsi?: RSIValues;
  ema?: EMAValues;
  sma?: SMAValues;
  macd?: MACDParams[]; // Array because backend might send multiple MACD sets (though unlikely for this app)
  bollinger_bands?: BollingerBandsParams[]; // Array for same reason
  adx?: ADXValues;
  trend_status?: TrendStatus;
  volatility?: VolatilityStatus;
  // Add other indicators as needed, matching backend structure
}

export interface MarketDataMessage {
  type: 'kline_with_indicators' | 'error'; // Added error type for websockets
  symbol: string;
  interval: string;
  klines: Kline[];
  indicators: IndicatorData; // This is the detailed IndicatorData type
  error?: string; // For error messages from backend via websockets
}

// For historical API endpoint (GET /api/indicators/historical/)
export interface HistoricalDataResponse {
    klines: Kline[];
    indicators: IndicatorData; // Contains all indicator arrays and their timestamps
    message?: string; // Optional informational message from backend
    error?: string; // Optional error message string from backend
}

// Type for Signal Analysis API endpoint (GET /api/signals/analyze/)
export interface SignalData {
  signal: 'STRONG_BUY' | 'BUY' | 'HOLD' | 'SELL' | 'STRONG_SELL' | 'ERROR' | 'LOADING' | null;
  summary: string; // Textual summary of the signal
  confidence: number | null; // Confidence score (e.g., 0.0 to 1.0), null if not applicable
  details: Record<string, any>; // Flexible object for additional signal details (e.g., specific indicator values contributing to signal)
  error?: string; // Optional error message if signal generation failed
}