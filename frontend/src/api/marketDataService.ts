import {ArimaResponse, HistoricalDataResponse, SignalData} from '../types/marketData'; // Added SignalData
import axiosInstance, { isAxiosError } from "./axiosInstance";

// Типи для запиту та відповіді ризик-менеджменту (потрібно узгодити з бекендом)
export interface RiskCalculationParams {
    accountBalance: number;
    riskPercent: number;
    leverage: number;
    entryPrice: number;
    stopLossPrice: number;
    takeProfitPrice?: number; // Optional
    symbol: string;
    positionSide: 'BUY' | 'SELL';
}

export interface RiskCalculationResponse {
    positionSizeAsset: number | string;
    positionSizeUSD: number | string;
    potentialLossUSD: number | string;
    potentialProfitUSD: number | string;
    riskRewardRatio?: number | string;
    liquidationPrice?: number | string;
    errorMessage?: string; // Renamed from error to avoid conflict with Error objects
    // Додаткові поля, якщо бекенд їх повертає
    stopLossPercentage?: number;
    amountToRiskUSD?: number;
}


export const getHistoricalIndicators = async (
  symbol: string,
  interval: string,
  limit?: number
): Promise<HistoricalDataResponse> => {
  try {
    const params: Record<string, string | number> = {
      symbol,
      interval,
    };
    if (limit) {
      params.limit = limit;
    }
    // Припускаємо, що URL API починається з /api/
    const response = await axiosInstance.get<HistoricalDataResponse>(`/api/indicators/historical/`, { params });
    return response.data;
  } catch (error) {
    console.error('Error fetching historical indicator data:', error);
    if (isAxiosError(error) && error.response) {
      console.error('Error response data (Historical):', error.response.data);
      console.error('Error response status (Historical):', error.response.status);
    }
    // Перекидаємо помилку далі, щоб її можна було обробити у компоненті
    throw error;
  }
};

// Нова функція для розрахунку ризик-менеджменту через бекенд
export const calculateRiskManagementOnBackend = async ( // Renamed for clarity
    params: RiskCalculationParams
): Promise<RiskCalculationResponse> => {
    try {
        const response = await axiosInstance.post<RiskCalculationResponse>(`/api/risk/calculate/`, params); // Example endpoint
        return response.data;
    } catch (error) {
        console.error('Error calculating risk management on backend:', error);
        if (isAxiosError(error) && error.response) {
            // Спроба витягнути повідомлення про помилку з відповіді бекенду
            const backendError = error.response.data?.detail || error.response.data?.error || error.response.data?.message || 'Calculation failed on server.';
            return {
                errorMessage: backendError,
                positionSizeAsset: '-', positionSizeUSD: '-', potentialLossUSD: '-', potentialProfitUSD: '-',
                riskRewardRatio: '-', liquidationPrice: '-'
            } as RiskCalculationResponse;
        }
        // Загальна помилка, якщо не вдалося обробити відповідь сервера або це не Axios помилка
        return {
            errorMessage: 'An unexpected error occurred during risk calculation.',
            positionSizeAsset: '-', positionSizeUSD: '-', potentialLossUSD: '-', potentialProfitUSD: '-',
            riskRewardRatio: '-', liquidationPrice: '-'
        } as RiskCalculationResponse;
    }
};

// Функція для отримання аналізу сигналу
export const getSignalAnalysis = async (
    symbol: string,
    interval: string
): Promise<SignalData> => {
    try {
        const response = await axiosInstance.get<SignalData>(`/api/signals/analyze/`, { params: { symbol, interval } });
        return response.data;
    } catch (error) {
        console.error('Error fetching signal analysis:', error);
        if (isAxiosError(error) && error.response) {
            return {
                signal: 'ERROR',
                summary: error.response.data?.detail || 'Failed to fetch signal analysis.',
                confidence: 0,
                details: {},
            }
        }
        throw error; // Rethrow for generic error handling if needed
    }
};

export const getArimaForecast = async (
    symbol: string,
    interval: string,
    history_limit?: number,
    forecast_steps?: number,
    optimize?: boolean
): Promise<ArimaResponse> => {
    try {
        const params: Record<string, string | number | boolean> = {
            symbol,
            interval,
        };
        if (history_limit) params.history_limit = history_limit;
        if (forecast_steps) params.forecast_steps = forecast_steps;
        if (optimize !== undefined) params.optimize = optimize;

        const response = await axiosInstance.get<ArimaResponse>('/api/arima/forecast/', {
            params,
            timeout: 300000 // Increase timeout to 5 minutes (300000 ms) or more
        });
        return response.data;
    } catch (error: any) {
        console.error('Error fetching ARIMA forecast:', error);
        if (error.response && error.response.data) {
            throw error.response.data;
        }
        // Check if the error is a timeout error specifically
        if (error.code === 'ECONNABORTED' && error.message.includes('timeout')) {
            throw new Error('ARIMA forecast request timed out. The server is taking too long to respond.');
        }
        throw new Error('Failed to fetch ARIMA forecast');
    }
};