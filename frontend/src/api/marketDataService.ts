
import { HistoricalDataResponse } from '../types/marketData';
import axiosInstance from "./axiosInstance";

// const API_BASE_URL = '/api';

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
    const response = await axiosInstance.get<HistoricalDataResponse>(`/indicators/historical/`, { params });
    return response.data;
  } catch (error) {
    console.error('Error fetching historical indicator data:', error);
    throw error;
  }
};