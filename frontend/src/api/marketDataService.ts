// frontend/src/api/marketDataService.ts
import axiosInstance from './axiosInstance';

export interface KlineData {
  open_time: number;        // Unix timestamp в мілісекундах
  open: string;             // Ціна відкриття (рядок, потрібно буде parseFloat)
  high: string;             // Максимальна ціна (рядок)
  low: string;              // Мінімальна ціна (рядок)
  close: string;            // Ціна закриття (рядок)
  volume: string;           // Обсяг торгів базовим активом (рядок)
  close_time: number;       // Unix timestamp в мілісекундах
  quote_asset_volume: string; // Обсяг торгів котируваним активом (рядок)
  number_of_trades: number; // Кількість угод (число)
  taker_buy_base_asset_volume: string; // Обсяг базового активу, куплений тейкером (рядок)
  taker_buy_quote_asset_volume: string; // Обсяг котируваного активу, куплений тейкером (рядок)
  ignore: string;           // Поле "Ignore" від Binance (рядок)
  symbol: string;           // Символ торгової пари (наприклад, "BTCUSDT")
  interval: string;         // Таймфрейм (наприклад, "1m", "1h")
}

// Інтерфейс для параметрів функції fetchMarketKlines
export interface FetchMarketDataParams { // Назва була експортована, але сам інтерфейс ні
  symbol?: string;
  interval?: string;
  limit?: number;
}

export const fetchMarketKlines = async (params: FetchMarketDataParams = {}): Promise<KlineData[]> => {
  const { symbol = 'BTCUSDT', interval = '1m', limit = 20 } = params;
  const endpoint = `market-data/klines/${symbol.toUpperCase()}/`;

  try {
    const response = await axiosInstance.get<KlineData[]>(endpoint, {
      params: {
        interval,
        limit,
      },
    });
    console.log("Received klines from backend:", response.data); // Додайте лог для перевірки
    return response.data;
  } catch (error) {
    console.error(`Error fetching klines for ${symbol}:`, error);
    throw error;
  }
};