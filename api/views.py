# api/views.py

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated # Або AllowAny для початкового тестування
from binance_connector.client import get_futures_klines # Наш новий сервіс
from binance.client import Client as BinanceAPIClient # Для констант інтервалів KLINE_INTERVAL_*

# Якщо у вас вже є TestView або інші view, залиште їх
# class TestView(APIView):
#     def get(self, request, *args, **kwargs):
#         return Response({"message": "API is working!"})

class MarketDataKlinesView(APIView):
    """
    API endpoint для отримання Klines (свічок) для вказаної торгової пари.
    """
    permission_classes = [IsAuthenticated] # Захищаємо ендпоінт, вимагаємо автентифікацію

    def get(self, request, symbol='BTCUSDT', format=None):
        """
        Повертає дані klines для вказаного символу.
        Приймає query-параметри: interval (за замовчуванням '1m') та limit (за замовчуванням 20).
        """
        interval_map = {
            '1m': BinanceAPIClient.KLINE_INTERVAL_1MINUTE,
            '5m': BinanceAPIClient.KLINE_INTERVAL_5MINUTE,
            '15m': BinanceAPIClient.KLINE_INTERVAL_15MINUTE,
            '30m': BinanceAPIClient.KLINE_INTERVAL_30MINUTE,
            '1h': BinanceAPIClient.KLINE_INTERVAL_1HOUR,
            '2h': BinanceAPIClient.KLINE_INTERVAL_2HOUR,
            '4h': BinanceAPIClient.KLINE_INTERVAL_4HOUR,
            '1d': BinanceAPIClient.KLINE_INTERVAL_1DAY,
            '1w': BinanceAPIClient.KLINE_INTERVAL_1WEEK,
            '1M': BinanceAPIClient.KLINE_INTERVAL_1MONTH,
        }

        req_interval_str = request.GET.get('interval', '1m')
        interval = interval_map.get(req_interval_str, BinanceAPIClient.KLINE_INTERVAL_1MINUTE)

        try:
            limit = int(request.GET.get('limit', 50))
            if limit <= 0 or limit > 1500: # Binance має обмеження на кількість klines
                limit = 200
        except ValueError:
            limit = 200

        # Отримуємо символ з URL, робимо його верхнім регістром
        symbol_upper = symbol.upper()

        data = get_futures_klines(symbol=symbol_upper, interval=interval, limit=limit)

        if isinstance(data, dict) and "error" in data:
            return Response(data, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        return Response(data, status=status.HTTP_200_OK)