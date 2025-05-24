# indicators/views.py
from django.views import View
from django.http import JsonResponse, HttpRequest
from django.conf import settings
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
import pandas as pd
import numpy as np
import logging
import traceback
import json
import math

from rest_framework import status

from binance_connector.client import get_futures_klines
from .technical_indicators import get_all_indicators, generate_trading_signals

logger = logging.getLogger(__name__)

HISTORICAL_MAX_KLINES = getattr(settings, 'MAX_KLINES_HISTORICAL_FETCH', 1000)


def getValueSafe(lst, index, default=None):
    try:
        if lst is None or not isinstance(lst, list) or not (-len(lst) <= index < len(lst)):
            return default
        val = lst[index]
        return val if val is not None else default
    except (IndexError, TypeError):
        return default


@method_decorator(csrf_exempt, name='dispatch')  # Exempt all methods if using for API
class HistoricalIndicatorsView(View):
    def get(self, request: HttpRequest, *args, **kwargs):
        symbol_req = None
        interval_req = None
        try:
            symbol_req = request.GET.get('symbol')
            interval_req = request.GET.get('interval')
            limit_param = request.GET.get('limit', str(HISTORICAL_MAX_KLINES))

            if not symbol_req or not interval_req:
                return JsonResponse({"error": "Missing 'symbol' or 'interval' query parameters."}, status=400)

            symbol = symbol_req.upper()
            interval = interval_req

            try:
                limit = int(limit_param)
                if not (10 <= limit <= 2000):  # Max limit for klines can be 1500 for some intervals on Binance
                    logger.warning(
                        f"Requested limit {limit} for {symbol} {interval} out of preferred range (10-1500). Clamping to {min(limit, 1500)}.")
                    limit = min(max(10, limit), 1500)
            except ValueError:
                logger.warning(
                    f"Invalid limit param '{limit_param}' for {symbol} {interval}. Defaulting to {HISTORICAL_MAX_KLINES}.")
                limit = HISTORICAL_MAX_KLINES

            logger.info(f"Fetching historical klines for {symbol}, interval {interval}, limit {limit}")

            klines_data_or_error = get_futures_klines(symbol=symbol, interval=interval, limit=limit)

            if isinstance(klines_data_or_error, dict) and 'error' in klines_data_or_error:
                error_message = klines_data_or_error['error']
                logger.error(f"Connector error for {symbol} {interval}: {error_message}")
                status_code = 400 if "Invalid symbol" in str(error_message) or "not found" in str(
                    error_message).lower() else 502
                return JsonResponse({"error": f"Binance connector error: {error_message}"}, status=status_code)

            if not klines_data_or_error or not isinstance(klines_data_or_error, list) or not klines_data_or_error:
                logger.warning(f"No klines or invalid data format returned for {symbol} {interval}.")
                return JsonResponse({"klines": [], "indicators": {"timestamps": []},
                                     "message": "No valid kline data found from connector."}, status=200)

            try:
                df = pd.DataFrame(klines_data_or_error)
                if df.empty:
                    logger.warning(f"DataFrame empty for {symbol} {interval} post-fetch.")
                    return JsonResponse({"klines": [], "indicators": {"timestamps": []},
                                         "message": "Empty kline data after DataFrame conversion."}, status=200)

                df.rename(columns={'open_time': 'timestamp'}, inplace=True, errors='ignore')
                if 'timestamp' not in df.columns:
                    logger.error(f"Timestamp column ('open_time' or 'timestamp') missing for {symbol} {interval}.")
                    return JsonResponse({"error": "Kline data structure error: missing timestamp column."}, status=500)

                required_cols = ['timestamp', 'open', 'high', 'low', 'close', 'volume']
                missing_cols = [col for col in required_cols if col not in df.columns]
                if missing_cols:
                    logger.error(f"DataFrame for {symbol} {interval} missing columns: {', '.join(missing_cols)}.")
                    return JsonResponse({"error": f"Data processing error: Missing columns: {', '.join(missing_cols)}"},
                                        status=500)

                for col in ['open', 'high', 'low', 'close', 'volume']:
                    df[col] = pd.to_numeric(df[col], errors='coerce')
                df.dropna(subset=['timestamp', 'open', 'high', 'low', 'close'], inplace=True)

                if df.empty:
                    logger.warning(
                        f"DataFrame became empty after coercing/dropping NaNs for OHLC - {symbol} {interval}")
                    return JsonResponse({"klines": [], "indicators": {"timestamps": []},
                                         "message": "No valid OHLC data after cleaning."}, status=200)

                df = df.astype(
                    {'timestamp': 'int64', 'open': 'float', 'high': 'float', 'low': 'float', 'close': 'float',
                     'volume': 'float'})
            except Exception as e:
                logger.error(f"Error processing klines for {symbol} {interval}: {e}\n{traceback.format_exc()}")
                return JsonResponse({"error": f"Internal data processing error during kline transformation: {str(e)}"},
                                    status=500)

            indicator_values = get_all_indicators(df.copy(), indicator_settings=None)

            if isinstance(indicator_values, dict) and 'error' in indicator_values:
                logger.error(f"Indicator calculation error for {symbol} {interval}: {indicator_values['error']}")
                return JsonResponse({"error": f"Indicator calculation error: {indicator_values['error']}"}, status=500)

            response_klines = df[required_cols].to_dict(orient='records')

            response_data = {
                'klines': response_klines,
                'indicators': indicator_values,
                'message': f"Data for {symbol} {interval} processed."
            }
            return JsonResponse(response_data, status=200)

        except Exception as e:
            error_symbol_log = symbol_req if symbol_req else "N/A_SYM"
            error_interval_log = interval_req if interval_req else "N/A_INT"
            logger.error(
                f"Unhandled error in HistoricalIndicatorsView for {error_symbol_log} {error_interval_log}: {e}\n{traceback.format_exc()}")
            return JsonResponse({'error': f'Unexpected server error in historical view: {str(e)}'}, status=500)


@method_decorator(csrf_exempt, name='dispatch')
class RiskCalculationView(View):
    def post(self, request: HttpRequest, *args, **kwargs):
        try:
            try:
                data = json.loads(request.body)
            except json.JSONDecodeError:
                return JsonResponse({'errorMessage': 'Invalid JSON in request body.'}, status=400)

            symbol_param = data.get('symbol')
            account_balance_str = data.get('accountBalance')
            risk_percent_str = data.get('riskPercent')
            leverage_str = data.get('leverage')
            entry_price_str = data.get('entryPrice')
            stop_loss_price_str = data.get('stopLossPrice')
            take_profit_price_str = data.get('takeProfitPrice')
            position_side_param = data.get('positionSide')

            required_params_map = {
                "accountBalance": account_balance_str, "riskPercent": risk_percent_str,
                "leverage": leverage_str, "entryPrice": entry_price_str,
                "stopLossPrice": stop_loss_price_str, "symbol": symbol_param, "positionSide": position_side_param
            }
            missing = [name for name, val in required_params_map.items() if val is None]
            if missing:
                return JsonResponse({'errorMessage': f"Missing required parameters: {', '.join(missing)}"}, status=400)

            try:
                account_balance = float(account_balance_str)
                risk_percent_input = float(risk_percent_str)
                leverage = float(leverage_str)
                entry_price = float(entry_price_str)
                stop_loss_price = float(stop_loss_price_str)
                take_profit_price = float(
                    take_profit_price_str) if take_profit_price_str is not None and take_profit_price_str != '' else None
            except ValueError as ve:
                return JsonResponse({'errorMessage': f'Invalid numeric value for parameter: {str(ve)}'}, status=400)

            if not (
                    account_balance > 0 and 0 < risk_percent_input <= 100 and leverage >= 1 and entry_price > 0 and stop_loss_price > 0):
                return JsonResponse({
                                        'errorMessage': 'Numeric inputs (Balance, Risk%, Leverage, Entry, SL) must be positive and within valid ranges.'},
                                    status=400)
            if take_profit_price is not None and take_profit_price <= 0:
                return JsonResponse({'errorMessage': 'Take profit, if provided, must be positive.'}, status=400)

            risk_percent_decimal = risk_percent_input / 100.0

            if position_side_param not in ['BUY', 'SELL']:
                return JsonResponse({'errorMessage': "Position side must be 'BUY' or 'SELL'."}, status=400)
            if entry_price == stop_loss_price:
                return JsonResponse({'errorMessage': "Entry and stop loss prices cannot be identical."}, status=400)

            if position_side_param == 'BUY':
                if stop_loss_price >= entry_price:
                    return JsonResponse({'errorMessage': "BUY: Stop Loss must be BELOW Entry Price."}, status=400)
                if take_profit_price is not None and take_profit_price <= entry_price:
                    return JsonResponse({'errorMessage': "BUY: Take Profit must be ABOVE Entry Price."}, status=400)
            elif position_side_param == 'SELL':
                if stop_loss_price <= entry_price:
                    return JsonResponse({'errorMessage': "SELL: Stop Loss must be ABOVE Entry Price."}, status=400)
                if take_profit_price is not None and take_profit_price >= entry_price:
                    return JsonResponse({'errorMessage': "SELL: Take Profit must be BELOW Entry Price."}, status=400)

            amount_to_risk_usd = account_balance * risk_percent_decimal
            stop_loss_distance_price = abs(entry_price - stop_loss_price)
            stop_loss_percentage_of_entry = stop_loss_distance_price / entry_price

            if stop_loss_percentage_of_entry == 0:  # Should be caught by previous check
                return JsonResponse({'errorMessage': "Stop loss price is too close to entry price."}, status=400)

            position_size_usd_calc = (amount_to_risk_usd * leverage) / stop_loss_percentage_of_entry
            position_size_asset_calc = position_size_usd_calc / entry_price

            potential_profit_usd_calc = None
            risk_reward_ratio_calc = None

            if take_profit_price and take_profit_price > 0:
                take_profit_distance_price = abs(entry_price - take_profit_price)
                potential_profit_usd_calc = position_size_asset_calc * take_profit_distance_price
                if stop_loss_distance_price > 0:
                    risk_reward_ratio_calc = take_profit_distance_price / stop_loss_distance_price

            liquidation_price_calc = None
            # Simplified liquidation for isolated margin. Binance formula is more complex.
            # Liq. Price (Long) = Entry * (1 - 1/Leverage + MaintenanceMarginRate_of_Entry)
            # Liq. Price (Short) = Entry * (1 + 1/Leverage - MaintenanceMarginRate_of_Entry)
            # MMR_of_Entry is an approximation. True MMR is tiered and based on position size.
            mmr_approx_rate = 0.005  # Example: 0.5% of entry price.
            if "BTC" in symbol_param.upper() or "ETH" in symbol_param.upper():
                mmr_approx_rate = 0.004
            elif "SOL" in symbol_param.upper():
                mmr_approx_rate = 0.007
            elif "DOGE" in symbol_param.upper() or "SHIB" in symbol_param.upper():
                mmr_approx_rate = 0.015

            if leverage >= 1:  # Calculations are for leverage > 0; leverage 1 means no liquidation from leverage.
                initial_margin_rate = 1 / leverage
                if position_side_param == 'BUY':
                    # Liquidation if price drops by (Initial Margin Rate - Maintenance Margin Rate)
                    # Price_Change_To_Liq = Entry * (Initial_Margin_Rate - mmr_approx_rate)
                    # Liq_Price = Entry - Price_Change_To_Liq
                    if initial_margin_rate > mmr_approx_rate:  # Ensure we don't liquidate above entry for long
                        liquidation_price_calc = entry_price * (1 - (initial_margin_rate - mmr_approx_rate))
                    else:  # Immediate or very close liquidation if MMR >= Initial Margin Rate
                        liquidation_price_calc = entry_price * (1 - 0.001)  # Extremely close
                elif position_side_param == 'SELL':
                    if initial_margin_rate > mmr_approx_rate:
                        liquidation_price_calc = entry_price * (1 + (initial_margin_rate - mmr_approx_rate))
                    else:
                        liquidation_price_calc = entry_price * (1 + 0.001)

                if liquidation_price_calc is not None and liquidation_price_calc <= 0:
                    liquidation_price_calc = None  # Invalid, price cannot be zero or negative

            asset_precision = 8 if "SHIB" in symbol_param.upper() else (
                0 if "XRP" in symbol_param.upper() or "DOGE" in symbol_param.upper() else 5)
            price_precision = 8 if "SHIB" in symbol_param.upper() else (4 if "DOGE" in symbol_param.upper() else 2)

            response_payload = {
                'positionSizeAsset': f"{position_size_asset_calc:.{asset_precision}f}" if position_size_asset_calc is not None else '-',
                'positionSizeUSD': f"{position_size_usd_calc:.2f}" if position_size_usd_calc is not None else '-',
                'potentialLossUSD': f"{amount_to_risk_usd:.2f}",  # Loss from account balance
                'amountToRiskUSD': f"{amount_to_risk_usd:.2f}",
                'stopLossPercentage': f"{stop_loss_percentage_of_entry * 100:.2f}%",
                'potentialProfitUSD': f"{potential_profit_usd_calc:.2f}" if potential_profit_usd_calc is not None else '-',
                'riskRewardRatio': f"1 : {risk_reward_ratio_calc:.2f}" if risk_reward_ratio_calc is not None else '-',
                'liquidationPrice': f"~ {liquidation_price_calc:.{price_precision}f}" if liquidation_price_calc is not None else 'N/A (check Lvg/MMR)',
            }
            return JsonResponse(response_payload, status=200)

        except Exception as e:
            logger.error(f"Unhandled error in RiskCalculationView: {e}\n{traceback.format_exc()}")
            return JsonResponse({'errorMessage': f'Unexpected server error: {str(e)}'}, status=500)


@method_decorator(csrf_exempt, name='dispatch')
class SignalAnalysisView(View):
    def get(self, request: HttpRequest, *args, **kwargs):
        symbol_req = None
        interval_req = None
        try:
            symbol_req = request.GET.get('symbol')
            interval_req = request.GET.get('interval')

            if not symbol_req or not interval_req:
                return JsonResponse({'error': 'Symbol and interval are required.'}, status=400)

            symbol = symbol_req.upper()
            interval = interval_req
            logger.info(f"Analyzing signal for {symbol}, interval {interval}")

            limit_for_signal = 200
            klines_data_or_error = get_futures_klines(symbol=symbol, interval=interval, limit=limit_for_signal)

            if isinstance(klines_data_or_error, dict) and 'error' in klines_data_or_error:
                error_msg = klines_data_or_error['error']
                logger.error(f"Signal Analysis: Connector error for {symbol} {interval}: {error_msg}")
                return JsonResponse(
                    {'signal': 'ERROR', 'summary': f"Data fetch error: {error_msg}", 'confidence': 0, 'details': {},
                     'error': error_msg}, status=502)

            if not klines_data_or_error or not isinstance(klines_data_or_error, list) or not klines_data_or_error:
                return JsonResponse(
                    {'signal': 'ERROR', 'summary': "No kline data for signal.", 'confidence': 0, 'details': {},
                     'error': "No klines."}, status=200)

            df = pd.DataFrame(klines_data_or_error)
            if df.empty:
                return JsonResponse(
                    {'signal': 'ERROR', 'summary': "Empty DataFrame from klines for signal.", 'confidence': 0,
                     'details': {}, 'error': "Empty klines DataFrame."}, status=200)

            df.rename(columns={'open_time': 'timestamp'}, inplace=True, errors='ignore')
            if 'timestamp' not in df.columns:
                return JsonResponse(
                    {'signal': 'ERROR', 'summary': 'Kline data structure error.', 'confidence': 0, 'details': {},
                     'error': 'Missing timestamp.'}, status=500)

            required_cols = ['timestamp', 'open', 'high', 'low', 'close', 'volume']
            missing_cols = [col for col in required_cols if col not in df.columns]
            if missing_cols:
                return JsonResponse(
                    {'signal': 'ERROR', 'summary': f"Malformed kline data (missing: {', '.join(missing_cols)}).",
                     'confidence': 0, 'details': {}, 'error': f"Missing columns: {', '.join(missing_cols)}."},
                    status=500)

            for col in ['open', 'high', 'low', 'close', 'volume']:
                df[col] = pd.to_numeric(df[col], errors='coerce')
            df.dropna(subset=['timestamp', 'open', 'high', 'low', 'close'], inplace=True)
            if df.empty:
                return JsonResponse(
                    {'signal': 'ERROR', 'summary': "No valid kline data after cleaning for signal.", 'confidence': 0,
                     'details': {}, 'error': 'No valid klines after cleaning.'}, status=200)

            df = df.astype({'timestamp': 'int64', 'open': 'float', 'high': 'float', 'low': 'float', 'close': 'float',
                            'volume': 'float'})

            indicator_values = get_all_indicators(df.copy(), indicator_settings=None)

            if isinstance(indicator_values, dict) and 'error' in indicator_values:
                error_msg = indicator_values['error']
                logger.error(f"Signal Analysis: Indicator error for {symbol} {interval}: {error_msg}")
                return JsonResponse(
                    {'signal': 'ERROR', 'summary': f"Indicator error: {error_msg}", 'confidence': 0, 'details': {},
                     'error': error_msg}, status=500)

            trading_signals_pd_series = generate_trading_signals(indicator_values, df.copy())

            current_signal_val: str = "HOLD"
            current_summary: str = "Market conditions appear neutral or signal is undetermined."
            current_confidence: float = 0.50
            signal_details: dict = {}

            if not trading_signals_pd_series.empty:
                current_signal_val = trading_signals_pd_series.iloc[-1] if len(
                    trading_signals_pd_series) > 0 else "HOLD"

            try:
                rsi_key = 'rsi_14'
                if indicator_values.get('rsi') and isinstance(indicator_values['rsi'], dict) and rsi_key in \
                        indicator_values['rsi']:
                    last_rsi_val = getValueSafe(indicator_values['rsi'][rsi_key], -1)
                    if last_rsi_val is not None:
                        signal_details[rsi_key] = round(last_rsi_val, 2)
                        if last_rsi_val > 70:
                            signal_details[f'{rsi_key}_level'] = "Overbought"
                        elif last_rsi_val < 30:
                            signal_details[f'{rsi_key}_level'] = "Oversold"
                        else:
                            signal_details[f'{rsi_key}_level'] = "Neutral"

                macd_params_str = "12_26_9"
                macd_data_list = indicator_values.get('macd', [])
                if isinstance(macd_data_list, list):
                    macd_set = next(
                        (m for m in macd_data_list if isinstance(m, dict) and m.get('params') == macd_params_str), None)
                    if macd_set:
                        macd_line = getValueSafe(macd_set.get('macd_line', []), -1)
                        signal_line = getValueSafe(macd_set.get('signal_line', []), -1)
                        if macd_line is not None and signal_line is not None:
                            signal_details['macd_value'] = f"M:{macd_line:.4f}, S:{signal_line:.4f}"
                            prev_macd = getValueSafe(macd_set.get('macd_line', []), -2)
                            prev_signal = getValueSafe(macd_set.get('signal_line', []), -2)
                            if prev_macd is not None and prev_signal is not None:
                                if macd_line > signal_line and prev_macd <= prev_signal:
                                    signal_details['macd_cross'] = "Bullish"
                                elif macd_line < signal_line and prev_macd >= prev_signal:
                                    signal_details['macd_cross'] = "Bearish"

                trend_status_data = indicator_values.get('trend_status', {})
                current_trend = trend_status_data.get('current_trend', 'UNDETERMINED') if isinstance(trend_status_data,
                                                                                                     dict) else 'UNDETERMINED'
                signal_details['current_trend'] = current_trend

                if current_signal_val == "BUY":
                    current_summary = f"Potential BUY for {symbol} ({interval}). Trend: {current_trend}."
                    current_confidence = 0.60
                    if current_trend == "UPTREND": current_confidence += 0.15
                    if signal_details.get(f'{rsi_key}_level') == "Oversold": current_confidence += 0.10
                    if signal_details.get('macd_cross') == "Bullish": current_confidence += 0.10
                elif current_signal_val == "SELL":
                    current_summary = f"Potential SELL for {symbol} ({interval}). Trend: {current_trend}."
                    current_confidence = 0.60
                    if current_trend == "DOWNTREND": current_confidence += 0.15
                    if signal_details.get(f'{rsi_key}_level') == "Overbought": current_confidence += 0.10
                    if signal_details.get('macd_cross') == "Bearish": current_confidence += 0.10
                else:
                    current_summary = f"HOLD for {symbol} ({interval}). Trend: {current_trend}. Conditions neutral/mixed."
                    current_confidence = 0.40
                    if current_trend == "FLAT": current_confidence += 0.1

                current_confidence = min(max(current_confidence, 0.05), 0.95)

            except Exception as detail_err:
                logger.error(f"Error during signal detail/summary for {symbol} {interval}: {detail_err}", exc_info=True)
                signal_details['summary_error'] = str(detail_err)

            valid_signals = ['STRONG_BUY', 'BUY', 'HOLD', 'SELL',
                             'STRONG_SELL']  # Визначте STRONG_BUY/SELL у generate_trading_signals
            final_signal = current_signal_val if current_signal_val in valid_signals else 'ERROR'
            if final_signal == 'ERROR' or not current_signal_val:  # Якщо сигнал порожній або невалідний
                final_signal = 'ERROR'
                current_summary = "Error determining signal from strategy or invalid signal returned."
                current_confidence = 0.0

            response_data = {
                'signal': final_signal,
                'summary': current_summary,
                'confidence': round(current_confidence, 2),
                'details': signal_details
            }
            return JsonResponse(response_data, status=status.HTTP_200_OK)

        except Exception as e:
            error_symbol_log = symbol_req if symbol_req else "N/A_SYM"
            error_interval_log = interval_req if interval_req else "N/A_INT"
            logger.error(
                f"Unhandled error in SignalAnalysisView for {error_symbol_log} {error_interval_log}: {e}\n{traceback.format_exc()}")
            return JsonResponse({
                'signal': 'ERROR', 'summary': f'Server error: {str(e)}', 'confidence': 0,
                'details': {'trace': traceback.format_exc() if settings.DEBUG else "Trace hidden"}, 'error': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)