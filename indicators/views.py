# indicators/views.py
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.conf import settings
import pandas as pd
import httpx  # For making HTTP requests to Binance API

from .technical_indicators import get_all_indicators, generate_trading_signals

# from .models import IndicatorSettings # If you have a model for settings

# Define MAX_KLINES_MEMORY for historical fetch, can be different from WebSocket
HISTORICAL_MAX_KLINES = getattr(settings, 'MAX_KLINES_HISTORICAL_FETCH', 1000)


class HistoricalIndicatorsView(APIView):
    """
    API endpoint to fetch historical k-lines with calculated indicators.
    """

    # permission_classes = [IsAuthenticated] # Add authentication if needed

    async def get(self, request, *args, **kwargs):
        symbol = request.query_params.get('symbol')
        interval = request.query_params.get('interval')
        limit_param = request.query_params.get('limit', str(HISTORICAL_MAX_KLINES))

        if not symbol or not interval:
            return Response(
                {"error": "Missing 'symbol' or 'interval' query parameters."},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            limit = int(limit_param)
            if limit <= 0 or limit > 2000:  # Binance limit is often 1000-1500 per request
                limit = HISTORICAL_MAX_KLINES
        except ValueError:
            limit = HISTORICAL_MAX_KLINES

        # Fetch historical k-lines from Binance
        # Using httpx for async request
        async with httpx.AsyncClient() as client:
            binance_url = f"{settings.BINANCE_FUTURES_API_BASE_URL}/fapi/v1/klines"
            params = {'symbol': symbol.upper(), 'interval': interval, 'limit': limit}

            try:
                response = await client.get(binance_url, params=params)
                response.raise_for_status()  # Raises an exception for 4XX/5XX responses
                klines_raw = response.json()
            except httpx.HTTPStatusError as e:
                return Response(
                    {"error": f"Binance API error: {e.response.status_code} - {e.response.text}"},
                    status=status.HTTP_502_BAD_GATEWAY
                )
            except Exception as e:
                return Response(
                    {"error": f"Failed to fetch klines from Binance: {str(e)}"},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )

        if not klines_raw:
            return Response({"klines": [], "indicators": {}, "signals": []}, status=status.HTTP_200_OK)

        df = pd.DataFrame(klines_raw, columns=[
            'timestamp', 'open', 'high', 'low', 'close', 'volume',
            'close_time', 'quote_asset_volume', 'number_of_trades',
            'taker_buy_base_asset_volume', 'taker_buy_quote_asset_volume', 'ignore'
        ])
        df = df[['timestamp', 'open', 'high', 'low', 'close', 'volume']].astype({
            'timestamp': 'int64',
            'open': 'float',
            'high': 'float',
            'low': 'float',
            'close': 'float',
            'volume': 'float'
        })

        # Calculate indicators
        # user_settings = None # Fetch from DB if IndicatorSettings model is used
        # indicator_settings_instance = IndicatorSettings.objects.filter(user=request.user, symbol=symbol, interval=interval).first()
        # if indicator_settings_instance:
        # user_settings = indicator_settings_instance.settings_json 
        indicator_values = get_all_indicators(df.copy(), indicator_settings=None)  # Pass user_settings here

        # Generate trading signals
        trading_signals_series = generate_trading_signals(indicator_values, df.copy())

        ohlcv_data_list = df.to_dict(orient='records')

        # Align signals with OHLCV data
        if not trading_signals_series.empty:
            temp_signal_df = trading_signals_series.reset_index()
            temp_signal_df.columns = ['datetime', 'signal_value']
            temp_signal_df['timestamp'] = temp_signal_df['datetime'].astype(np.int64) // 10 ** 6
            signal_map = {row['timestamp']: row['signal_value'] for _, row in temp_signal_df.iterrows()}
            for kline_point in ohlcv_data_list:
                kline_point['signal'] = signal_map.get(kline_point['timestamp'], 'HOLD')
        else:
            for kline_point in ohlcv_data_list:
                kline_point['signal'] = 'HOLD'

        response_data = {
            'klines': ohlcv_data_list,
            'indicators': indicator_values,
            # 'signals': formatted_signals # if sending separately
        }
        return Response(response_data, status=status.HTTP_200_OK)
