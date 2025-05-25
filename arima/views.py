# root/arima/views.py
from django.http import JsonResponse, HttpRequest
from django.conf import settings
from django.views import View
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
import pandas as pd
import numpy as np
import logging
import traceback

from binance_connector.client import get_futures_klines
from .predictor import optimize_arima_order, get_arima_forecast, FORECAST_STEPS as DEFAULT_FORECAST_STEPS
from indicators.technical_indicators import _convert_numpy_types_for_serialization

logger = logging.getLogger(__name__)

ARIMA_MAX_HISTORICAL_KLINES = getattr(settings, 'ARIMA_MAX_HISTORICAL_KLINES', 100)
ARIMA_MIN_HISTORICAL_KLINES = getattr(settings, 'ARIMA_MIN_HISTORICAL_KLINES', 50)


@method_decorator(csrf_exempt, name='dispatch')
class ArimaForecastView(View):
    def get(self, request: HttpRequest, *args, **kwargs):
        symbol_req = request.GET.get('symbol')
        interval_req = request.GET.get('interval')
        history_limit_param = request.GET.get('history_limit', str(ARIMA_MAX_HISTORICAL_KLINES))
        forecast_steps_param = request.GET.get('forecast_steps', str(DEFAULT_FORECAST_STEPS))
        optimize_params_param = request.GET.get('optimize', 'true')

        if not symbol_req or not interval_req:
            return JsonResponse({"error": "Missing 'symbol' or 'interval' query parameters."}, status=400)

        symbol = symbol_req.upper()
        interval = interval_req
        optimize_params = optimize_params_param.lower() == 'true'

        try:
            history_limit = int(history_limit_param)
            if not (
                    ARIMA_MIN_HISTORICAL_KLINES <= history_limit <= ARIMA_MAX_HISTORICAL_KLINES * 2):
                history_limit = ARIMA_MAX_HISTORICAL_KLINES
                logger.warning(f"ARIMA: history_limit clamped to {history_limit} for {symbol} {interval}")
        except ValueError:
            history_limit = ARIMA_MAX_HISTORICAL_KLINES
            logger.warning(f"ARIMA: Invalid history_limit, defaulting to {history_limit} for {symbol} {interval}")

        try:
            forecast_steps = int(forecast_steps_param)
            if not (1 <= forecast_steps <= 50):
                forecast_steps = DEFAULT_FORECAST_STEPS
                logger.warning(f"ARIMA: forecast_steps clamped to {forecast_steps} for {symbol} {interval}")
        except ValueError:
            forecast_steps = DEFAULT_FORECAST_STEPS
            logger.warning(f"ARIMA: Invalid forecast_steps, defaulting to {forecast_steps} for {symbol} {interval}")

        logger.info(
            f"ARIMA: Requesting forecast for {symbol} {interval}, history: {history_limit}, steps: {forecast_steps}, optimize: {optimize_params}")

        klines_data_or_error = get_futures_klines(symbol=symbol, interval=interval, limit=history_limit)

        if isinstance(klines_data_or_error, dict) and 'error' in klines_data_or_error:
            error_message = klines_data_or_error['error']
            logger.error(f"ARIMA: Connector error for {symbol} {interval}: {error_message}")
            return JsonResponse({"error": f"Binance connector error: {error_message}"}, status=502)

        if not klines_data_or_error or not isinstance(klines_data_or_error, list) or len(
                klines_data_or_error) < ARIMA_MIN_HISTORICAL_KLINES:
            logger.warning(
                f"ARIMA: Not enough data for {symbol} {interval} (received {len(klines_data_or_error if klines_data_or_error else [])}). Need at least {ARIMA_MIN_HISTORICAL_KLINES}.")
            return JsonResponse({
                "error": f"Not enough historical data to perform ARIMA forecast (need at least {ARIMA_MIN_HISTORICAL_KLINES})."},
                status=400)

        try:
            df = pd.DataFrame(klines_data_or_error)
            df.rename(columns={'open_time': 'timestamp', 'close_price': 'close'}, inplace=True,
                      errors='ignore')
            if 'timestamp' not in df.columns or 'close' not in df.columns:
                if 'close' not in df.columns and 'close_price' in df.columns:
                    df.rename(columns={'close_price': 'close'}, inplace=True)
                elif 'close' not in df.columns and 'Close' in df.columns:
                    df.rename(columns={'Close': 'close'}, inplace=True)

                if 'timestamp' not in df.columns or 'close' not in df.columns:
                    logger.error(
                        f"ARIMA: Required columns 'timestamp' or 'close' are missing for {symbol} {interval}. Available: {df.columns.tolist()}")
                    return JsonResponse({"error": "Kline data structure error: missing timestamp or close column."},
                                        status=500)

            df['timestamp'] = pd.to_datetime(df['timestamp'], unit='ms')
            df['close'] = pd.to_numeric(df['close'], errors='coerce')
            df.dropna(subset=['timestamp', 'close'], inplace=True)

            if len(df) < ARIMA_MIN_HISTORICAL_KLINES:
                logger.warning(f"ARIMA: Not enough valid data after cleaning for {symbol} {interval} ({len(df)}).")
                return JsonResponse({"error": "Not enough valid historical data after cleaning."}, status=400)

            df_series = df.set_index('timestamp')['close']

        except Exception as e:
            logger.error(f"ARIMA: Error processing klines for {symbol} {interval}: {e}\n{traceback.format_exc()}")
            return JsonResponse({"error": f"Internal data processing error: {str(e)}"}, status=500)

        arima_order = None
        seasonal_order = None

        if optimize_params:
            use_seasonal_optimization = True
            seasonality_period_m = 1

            if interval.endswith('m'):
                seasonality_period_m = 15
                # pass
            elif interval.endswith('h'):
                seasonality_period_m = 24
            elif interval.endswith('d'):
                seasonality_period_m = 7

            arima_order, seasonal_order = optimize_arima_order(
                df_series,
                seasonal=use_seasonal_optimization,
                m=seasonality_period_m,
                start_P=0, max_P=1, start_Q=0, max_Q=1, D_range=(0,1),
                trace=settings.DEBUG
            )

        forecast_values, confidence_intervals_df = get_arima_forecast(
            df_series,
            order=arima_order,
            seasonal_order=seasonal_order,
            steps=forecast_steps
        )

        context_points = 50
        historical_context_series = df_series.tail(context_points)

        # Ensure all Index objects are converted to lists *before* serialization
        if isinstance(historical_context_series.index, pd.DatetimeIndex):
            historical_timestamps_list = (historical_context_series.index.astype(np.int64) // 10 ** 6).tolist()
        else:  # Handles RangeIndex or other index types
            historical_timestamps_list = historical_context_series.index.tolist()

        historical_values_list = historical_context_series.tolist()

        if isinstance(forecast_values.index, pd.DatetimeIndex):
            forecast_timestamps_list = (forecast_values.index.astype(np.int64) // 10 ** 6).tolist()
        else:  # Handles RangeIndex or other index types
            forecast_timestamps_list = forecast_values.index.tolist()

        forecast_values_list = forecast_values.tolist()

        conf_int_lower_list = []
        conf_int_upper_list = []
        if isinstance(confidence_intervals_df, pd.DataFrame) and not confidence_intervals_df.empty:
            try:
                conf_int_lower_list = confidence_intervals_df.iloc[:, 0].tolist()
                conf_int_upper_list = confidence_intervals_df.iloc[:, 1].tolist()
            except IndexError:
                logger.error(
                    f"ARIMA: Could not access confidence interval columns by position for {symbol} {interval}.")
                conf_int_lower_list = [np.nan] * forecast_steps  # Fallback
                conf_int_upper_list = [np.nan] * forecast_steps  # Fallback
            except Exception as e_ci:
                logger.error(f"ARIMA: Error processing confidence intervals for {symbol} {interval}: {e_ci}")
                conf_int_lower_list = [np.nan] * forecast_steps  # Fallback
                conf_int_upper_list = [np.nan] * forecast_steps  # Fallback
        else:  # Fallback if confidence_intervals_df is not a valid DataFrame
            conf_int_lower_list = [np.nan] * forecast_steps
            conf_int_upper_list = [np.nan] * forecast_steps

        response_data = {
            "symbol": symbol,
            "interval": interval,
            "historical_timestamps": historical_timestamps_list,
            "historical_values": historical_values_list,
            "forecast_timestamps": forecast_timestamps_list,
            "forecast_values": forecast_values_list,
            "conf_int_lower": conf_int_lower_list,
            "conf_int_upper": conf_int_upper_list,
            "used_order": arima_order if arima_order else "default",
            "used_seasonal_order": seasonal_order if seasonal_order else "default_or_none",
            "forecast_steps": forecast_steps,
            "message": f"ARIMA forecast for {symbol} {interval} generated."
        }

        # Now, pass the dictionary of lists and basic types to _convert_numpy_types_for_serialization
        # This function will handle any stray numpy numeric types within the lists.
        return JsonResponse(_convert_numpy_types_for_serialization(response_data))
