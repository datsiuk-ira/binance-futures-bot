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

            limit_for_signal = 200  # Sufficient for most lookbacks in generate_trading_signals
            klines_data_or_error = get_futures_klines(symbol=symbol, interval=interval, limit=limit_for_signal)

            if isinstance(klines_data_or_error, dict) and 'error' in klines_data_or_error:
                error_msg = klines_data_or_error['error']
                logger.error(f"Signal Analysis: Connector error for {symbol} {interval}: {error_msg}")
                return JsonResponse(
                    {'signal': 'ERROR', 'summary': f"Data fetch error: {error_msg}", 'confidence': 0, 'details': {},
                     'error': error_msg}, status=502)

            if not klines_data_or_error or not isinstance(klines_data_or_error, list) or not klines_data_or_error:
                logger.warning(f"Signal Analysis: No klines or invalid data for {symbol} {interval}")
                return JsonResponse(
                    {'signal': 'ERROR', 'summary': "No kline data for signal.", 'confidence': 0, 'details': {},
                     'error': "No klines received from connector."}, status=200)  # 200 if simply no data

            df = pd.DataFrame(klines_data_or_error)
            if df.empty:
                logger.warning(f"Signal Analysis: Empty DataFrame for {symbol} {interval}")
                return JsonResponse(
                    {'signal': 'ERROR', 'summary': "Empty DataFrame from klines for signal.", 'confidence': 0,
                     'details': {}, 'error': "Empty klines DataFrame."}, status=200)

            df.rename(columns={'open_time': 'timestamp'}, inplace=True, errors='ignore')
            if 'timestamp' not in df.columns:
                logger.error(f"Signal Analysis: Timestamp column missing for {symbol} {interval}")
                return JsonResponse(
                    {'signal': 'ERROR', 'summary': 'Kline data structure error (timestamp).', 'confidence': 0,
                     'details': {},
                     'error': 'Missing timestamp column in kline data.'}, status=500)

            required_cols = ['timestamp', 'open', 'high', 'low', 'close', 'volume']
            missing_cols = [col for col in required_cols if col not in df.columns]
            if missing_cols:
                logger.error(f"Signal Analysis: Missing kline columns for {symbol} {interval}: {missing_cols}")
                return JsonResponse(
                    {'signal': 'ERROR', 'summary': f"Malformed kline data (missing: {', '.join(missing_cols)}).",
                     'confidence': 0, 'details': {}, 'error': f"Missing columns: {', '.join(missing_cols)}."},
                    status=500)

            for col in ['open', 'high', 'low', 'close', 'volume']:
                df[col] = pd.to_numeric(df[col], errors='coerce')
            df.dropna(subset=['timestamp', 'open', 'high', 'low', 'close'], inplace=True)

            if df.empty:
                logger.warning(f"Signal Analysis: DataFrame empty after cleaning for {symbol} {interval}")
                return JsonResponse(
                    {'signal': 'ERROR', 'summary': "No valid kline data after cleaning for signal.", 'confidence': 0,
                     'details': {}, 'error': 'No valid klines after cleaning.'}, status=200)

            df = df.astype({'timestamp': 'int64', 'open': 'float', 'high': 'float', 'low': 'float', 'close': 'float',
                            'volume': 'float'})

            indicator_values = get_all_indicators(df.copy(), indicator_settings=None)

            if isinstance(indicator_values, dict) and 'error' in indicator_values:
                error_msg = indicator_values['error']
                logger.error(f"Signal Analysis: Indicator calculation error for {symbol} {interval}: {error_msg}")
                return JsonResponse(
                    {'signal': 'ERROR', 'summary': f"Indicator error: {error_msg}", 'confidence': 0, 'details': {},
                     'error': error_msg}, status=500)

            trading_signals_pd_series = generate_trading_signals(indicator_values, df.copy())

            # Initialize with defaults from the strategy's typical HOLD state
            signal_type_from_strategy = "HOLD"
            signal_reliability = 0.10  # Default reliability for HOLD
            signal_reason = "Neutral market conditions or no strong signal."

            if not trading_signals_pd_series.empty:
                last_signal_output = trading_signals_pd_series.iloc[-1]
                if isinstance(last_signal_output, dict):
                    signal_type_from_strategy = last_signal_output.get("type", "HOLD")
                    signal_reliability = last_signal_output.get("reliability", 0.1)
                    signal_reason = last_signal_output.get("reason", "No specific reason provided.")
                else:
                    logger.error(
                        f"Signal Analysis: Last signal from strategy was not a dict for {symbol} {interval}: {last_signal_output}")
                    signal_type_from_strategy = "ERROR"  # Mark as error if format is wrong
                    signal_reason = "Internal error: Malformed signal data from strategy."
                    signal_reliability = 0.0
            else:
                logger.warning(f"Signal Analysis: trading_signals_pd_series was empty for {symbol} {interval}")
                signal_type_from_strategy = "ERROR"
                signal_reason = "Internal error: No signals generated by strategy."
                signal_reliability = 0.0

            signal_details: dict = {}
            try:
                # --- Populate signal_details with relevant indicator values ---
                rsi_key_to_use = None
                rsi_data_dict = indicator_values.get('rsi', {})
                if rsi_data_dict:
                    rsi_key_options = [f'rsi_{p}' for p in [14, 7, 21]]
                    rsi_key_to_use = next((k for k in rsi_key_options if k in rsi_data_dict and rsi_data_dict[k]), None)
                    if not rsi_key_to_use and rsi_data_dict: rsi_key_to_use = next(iter(rsi_data_dict), None)

                if rsi_key_to_use:
                    last_rsi_val = getValueSafe(indicator_values['rsi'][rsi_key_to_use], -1)
                    if last_rsi_val is not None:
                        signal_details[rsi_key_to_use] = round(last_rsi_val, 2)
                        if last_rsi_val > 70:
                            signal_details[f'{rsi_key_to_use}_level'] = "Overbought"
                        elif last_rsi_val < 30:
                            signal_details[f'{rsi_key_to_use}_level'] = "Oversold"
                        else:
                            signal_details[f'{rsi_key_to_use}_level'] = "Neutral"

                macd_params_str = "12_26_9"  # Default/common MACD params
                macd_data_list = indicator_values.get('macd', [])
                if isinstance(macd_data_list, list):
                    macd_set = next(
                        (m for m in macd_data_list if isinstance(m, dict) and m.get('params') == macd_params_str), None)
                    if macd_set:
                        macd_line_val = getValueSafe(macd_set.get('macd_line', []), -1)
                        signal_line_val = getValueSafe(macd_set.get('signal_line', []), -1)
                        hist_val = getValueSafe(macd_set.get('histogram', []), -1)
                        if macd_line_val is not None and signal_line_val is not None:
                            signal_details['macd_value'] = f"M:{macd_line_val:.4f}, S:{signal_line_val:.4f}"
                        if hist_val is not None:
                            signal_details['macd_histogram'] = round(hist_val, 4)

                trend_status_data = indicator_values.get('trend_status', {})
                current_trend = trend_status_data.get('current_trend', 'UNDETERMINED') if isinstance(trend_status_data,
                                                                                                     dict) else 'UNDETERMINED'
                signal_details['current_trend'] = current_trend

                last_adx_val = getValueSafe(indicator_values.get('adx_line', []), -1)
                if last_adx_val is not None: signal_details['adx_value'] = round(last_adx_val, 2)

                last_vwap_val = getValueSafe(indicator_values.get('vwap_line', []), -1)
                last_close_price = getValueSafe(df['close'].tolist(), -1)
                if last_vwap_val is not None and last_close_price is not None:
                    signal_details['vwap_value'] = round(last_vwap_val, 2)
                    if last_close_price > last_vwap_val:
                        signal_details['price_vs_vwap'] = "Above"
                    elif last_close_price < last_vwap_val:
                        signal_details['price_vs_vwap'] = "Below"
                    else:
                        signal_details['price_vs_vwap'] = "At"

                # Add Ichimoku details
                ichimoku_data = indicator_values.get('ichimoku_cloud', {})
                if isinstance(ichimoku_data, dict):
                    tk_val = getValueSafe(ichimoku_data.get('tenkan_sen', []), -1)
                    kj_val = getValueSafe(ichimoku_data.get('kijun_sen', []), -1)
                    sa_val = getValueSafe(ichimoku_data.get('senkou_span_a', []), -1)
                    sb_val = getValueSafe(ichimoku_data.get('senkou_span_b', []), -1)
                    cs_val = getValueSafe(ichimoku_data.get('chikou_span', []),
                                          -1)  # Note: Chikou is usually compared to past price
                    if tk_val is not None: signal_details['ichimoku_tenkan'] = round(tk_val, 4)
                    if kj_val is not None: signal_details['ichimoku_kijun'] = round(kj_val, 4)
                    if sa_val is not None and sb_val is not None and last_close_price is not None:
                        if last_close_price > max(sa_val, sb_val):
                            signal_details['price_vs_kumo'] = "Above Cloud"
                        elif last_close_price < min(sa_val, sb_val):
                            signal_details['price_vs_kumo'] = "Below Cloud"
                        else:
                            signal_details['price_vs_kumo'] = "Inside Cloud"

            except Exception as detail_err:
                logger.error(
                    f"Signal Analysis: Error during signal detail enrichment for {symbol} {interval}: {detail_err}",
                    exc_info=True)
                signal_details['enrichment_error'] = str(detail_err)

            # Determine final_signal ('STRONG_BUY', etc.) based on signal_type and signal_reliability
            final_signal_str = signal_type_from_strategy

            if signal_type_from_strategy == "BUY":
                if signal_reliability >= 0.75: final_signal_str = "STRONG_BUY"
                # No "weak" buy, just BUY if not strong
            elif signal_type_from_strategy == "SELL":
                if signal_reliability >= 0.75: final_signal_str = "STRONG_SELL"
            elif signal_type_from_strategy == "ERROR":  # If strategy itself reported an error
                final_signal_str = "ERROR"
                signal_reason = signal_reason if signal_reason else "Error in signal generation strategy."
                signal_reliability = 0.0

            valid_frontend_signals = ['STRONG_BUY', 'BUY', 'HOLD', 'SELL', 'STRONG_SELL', 'ERROR']
            if final_signal_str not in valid_frontend_signals:
                logger.warning(
                    f"Signal type '{final_signal_str}' from strategy/conversion is not a valid frontend signal. Defaulting to ERROR or HOLD.")
                final_signal_str = "ERROR" if signal_type_from_strategy == "ERROR" else "HOLD"

            response_data = {
                'signal': final_signal_str,
                'summary': signal_reason,
                'confidence': round(signal_reliability, 2),
                'details': signal_details,
                'error': None if final_signal_str != "ERROR" else signal_reason  # Add error field if applicable
            }
            if final_signal_str == "ERROR" and not response_data.get('error'):  # Ensure error key is set
                response_data['error'] = signal_reason

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