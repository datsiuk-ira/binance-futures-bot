import pandas as pd
import numpy as np
import logging
import pandas_ta as ta

logger = logging.getLogger(__name__)


def _convert_numpy_types_for_serialization(data):
    if isinstance(data, list):
        return [_convert_numpy_types_for_serialization(x) for x in data]
    elif isinstance(data, dict):
        return {k: _convert_numpy_types_for_serialization(v) for k, v in data.items()}
    elif isinstance(data, np.bool_):
        return bool(data)
    elif isinstance(data, np.integer):
        return int(data)
    elif isinstance(data, np.floating):
        if np.isnan(data) or np.isinf(data):
            return None
        return float(data)
    elif isinstance(data, float):
        if np.isnan(data) or np.isinf(data):
            return None
    return data


def calculate_sma(prices: pd.Series, period: int) -> pd.Series:
    if prices.empty or len(prices) < 1:
        return pd.Series([np.nan] * len(prices),
                         index=prices.index if prices.index.name is not None or not prices.index.empty else pd.RangeIndex(
                             len(prices)), dtype=float)
    return prices.rolling(window=period, min_periods=1).mean()


def calculate_ema(prices: pd.Series, period: int) -> pd.Series:
    if prices.empty:
        return pd.Series([np.nan] * len(prices),
                         index=prices.index if prices.index.name is not None or not prices.index.empty else pd.RangeIndex(
                             len(prices)), dtype=float)
    return prices.ewm(span=period, adjust=False, min_periods=1).mean()


def calculate_rsi(prices: pd.Series, period: int = 14) -> pd.Series:
    if prices.empty or len(prices) < 2:
        return pd.Series([np.nan] * len(prices),
                         index=prices.index if prices.index.name is not None or not prices.index.empty else pd.RangeIndex(
                             len(prices)), dtype=float)
    delta = prices.diff()
    gain = delta.where(delta > 0, 0.0)
    loss = -delta.where(delta < 0, 0.0)
    avg_gain = gain.ewm(com=period - 1, min_periods=period, adjust=False).mean()
    avg_loss = loss.ewm(com=period - 1, min_periods=period, adjust=False).mean()
    rs = avg_gain / avg_loss
    rs = rs.replace([np.inf, -np.inf], np.nan)
    rsi = 100.0 - (100.0 / (1.0 + rs))
    rsi.loc[(avg_gain > 0) & (avg_loss == 0)] = 100.0
    rsi.loc[(avg_gain == 0) & (avg_loss > 0)] = 0.0
    rsi.loc[(avg_gain == 0) & (avg_loss == 0)] = 50.0  # Or np.nan, 50 is a common convention
    return rsi


def calculate_macd(prices: pd.Series, fast_period: int = 12, slow_period: int = 26,
                   signal_period: int = 9) -> pd.DataFrame:
    empty_df_index = prices.index if prices.index.name is not None or not prices.index.empty else pd.RangeIndex(
        len(prices))
    if prices.empty:
        return pd.DataFrame(columns=['MACD', 'Signal', 'Histogram'], index=empty_df_index, dtype=float)

    ema_fast = calculate_ema(prices, fast_period)
    ema_slow = calculate_ema(prices, slow_period)
    macd_line = ema_fast - ema_slow

    # Drop NaNs before calculating signal line to prevent all NaNs if macd_line starts with NaNs
    signal_line_calculated = calculate_ema(macd_line.dropna(), signal_period)

    df = pd.DataFrame(index=prices.index)  # Ensure index matches original prices
    df['MACD'] = macd_line
    df['Signal'] = signal_line_calculated  # This will align based on index, NaNs where appropriate
    df['Signal'] = df['Signal'].reindex(df.index)  # Explicitly reindex to match prices.index fully
    df['Histogram'] = df['MACD'] - df['Signal']
    return df


def calculate_bollinger_bands(prices: pd.Series, period: int = 20, num_std_dev: float = 2.0) -> pd.DataFrame:
    empty_df_index = prices.index if prices.index.name is not None or not prices.index.empty else pd.RangeIndex(
        len(prices))
    if prices.empty:
        return pd.DataFrame(columns=['Middle', 'Upper', 'Lower'], index=empty_df_index, dtype=float)
    middle_band = calculate_sma(prices, period)
    rolling_std = prices.rolling(window=period, min_periods=1).std()
    upper_band = middle_band + (rolling_std * num_std_dev)
    lower_band = middle_band - (rolling_std * num_std_dev)
    return pd.DataFrame({'Middle': middle_band, 'Upper': upper_band, 'Lower': lower_band}, index=prices.index)


def calculate_stochastic_oscillator(data_df, k_period=14, d_period=3):
    if not all(col in data_df.columns for col in ['high', 'low', 'close']):
        logger.warning("Stochastic Oscillator: Missing high, low, or close columns.")
        return {'k_line': np.full(len(data_df), np.nan), 'd_line': np.full(len(data_df), np.nan)}

    if len(data_df) < max(k_period, d_period):
        logger.warning(f"Stochastic Oscillator: Insufficient data for period {k_period}/{d_period}. Have {len(data_df)} points.")
        return {'k_line': np.full(len(data_df), np.nan), 'd_line': np.full(len(data_df), np.nan)}

    try:
        stoch = ta.stoch(high=data_df['high'], low=data_df['low'], close=data_df['close'], k=k_period, d=d_period)
        k_line = stoch[f'STOCHk_{k_period}_{d_period}_{d_period}']
        d_line = stoch[f'STOCHd_{k_period}_{d_period}_{d_period}']
    except Exception as e:
        logger.error(f"Error in pandas_ta.stoch: {e}")
        k_line = pd.Series(np.nan, index=data_df.index)
        d_line = pd.Series(np.nan, index=data_df.index)

    return {
        'k_line': k_line.values,
        'd_line': d_line.values
    }


def calculate_atr(data_df, period=14):
    if not all(col in data_df.columns for col in ['high', 'low', 'close']):
        logger.warning("ATR: Missing high, low, or close columns.")
        return np.full(len(data_df), np.nan)

    if len(data_df) < period:
        logger.warning(f"ATR: Insufficient data for period {period}. Have {len(data_df)} points.")
        return np.full(len(data_df), np.nan)

    try:
        atr_series = ta.atr(high=data_df['high'], low=data_df['low'], close=data_df['close'], length=period)
    except Exception as e:
        logger.error(f"Error in pandas_ta.atr: {e}")
        atr_series = pd.Series(np.nan, index=data_df.index)

    return atr_series.values


def calculate_adx(data_df, period=14):
    if not all(col in data_df.columns for col in ['high', 'low', 'close']):
        logger.warning("ADX: Missing high, low, or close columns.")
        return np.full(len(data_df), np.nan)

    if len(data_df) < period * 2:
        logger.warning(f"ADX: Insufficient data for period {period}. Have {len(data_df)} points.")
        return np.full(len(data_df), np.nan)

    try:
        adx_series = ta.adx(high=data_df['high'], low=data_df['low'], close=data_df['close'], length=period)
        adx_values = adx_series[f'ADX_{period}']
    except Exception as e:
        logger.error(f"Error in pandas_ta.adx: {e}")
        adx_values = pd.Series(np.nan, index=data_df.index)

    return adx_values.values


def calculate_obv(data_df):
    if not all(col in data_df.columns for col in ['close', 'volume']):
        logger.warning("OBV: Missing close or volume columns.")
        return np.full(len(data_df), np.nan)

    if len(data_df) == 0:
        return np.array([])

    try:
        obv_series = ta.obv(close=data_df['close'], volume=data_df['volume'])
    except Exception as e:
        logger.error(f"Error in pandas_ta.obv: {e}")
        obv_series = pd.Series(np.nan, index=data_df.index)

    return obv_series.values


def calculate_vwap(data_df):
    if not all(col in data_df.columns for col in ['high', 'low', 'close', 'volume']):
        logger.warning("VWAP: Missing high, low, close, or volume columns.")
        return np.full(len(data_df), np.nan)

    if len(data_df) == 0:
        return np.array([])

    try:
        vwap_series = ta.vwap(high=data_df['high'], low=data_df['low'], close=data_df['close'], volume=data_df['volume'])
    except Exception as e:
        logger.error(f"Error in pandas_ta.vwap: {e}")
        vwap_series = pd.Series(np.nan, index=data_df.index)

    return vwap_series.values


def calculate_ichimoku_cloud(data_df, tenkan_period=9, kijun_period=26, senkou_b_period=52, chikou_period=26,
                             senkou_span_displacement=26):
    if not isinstance(data_df, pd.DataFrame):
        data_df = pd.DataFrame(data_df)

    df_copy = data_df.copy()
    df_copy.columns = [str(col).lower() for col in df_copy.columns]

    if not all(col in df_copy.columns for col in ['high', 'low', 'close']):
        logger.warning("Ichimoku: Missing high, low, or close columns.")
        nan_array = np.full(len(data_df), np.nan)
        return {
            'tenkan_sen': nan_array, 'kijun_sen': nan_array,
            'senkou_span_a': nan_array, 'senkou_span_b': nan_array,
            'chikou_span': nan_array,
        }

    try:
        ichimoku_df, _ = ta.ichimoku(
            high=df_copy['high'],
            low=df_copy['low'],
            close=df_copy['close'],
            tenkan=tenkan_period,
            kijun=kijun_period,
            senkou=senkou_b_period,
            chikou=chikou_period,
            offset=senkou_span_displacement
        )
    except Exception as e:
        logger.error(f"Error calculating Ichimoku with pandas_ta: {e}")
        nan_array = np.full(len(data_df), np.nan)
        return {
            'tenkan_sen': nan_array, 'kijun_sen': nan_array,
            'senkou_span_a': nan_array, 'senkou_span_b': nan_array,
            'chikou_span': nan_array,
        }

    if ichimoku_df is None or ichimoku_df.empty:
        nan_array = np.full(len(data_df), np.nan)
        return {
            'tenkan_sen': nan_array, 'kijun_sen': nan_array,
            'senkou_span_a': nan_array, 'senkou_span_b': nan_array,
            'chikou_span': nan_array,
        }

    tenkan_col_name = f'ITS_{tenkan_period}'
    kijun_col_name = f'IKS_{kijun_period}'
    senkou_a_col_name = f'ISA_{tenkan_period}'
    senkou_a_col_actual = f'ISA_{tenkan_period}'
    if f'ISA_{senkou_span_displacement}' in ichimoku_df.columns:
        senkou_a_col_actual = f'ISA_{senkou_span_displacement}'
    elif 'ISA' in ichimoku_df.columns:
        senkou_a_col_actual = 'ISA'

    senkou_b_col_actual = f'ISB_{senkou_b_period}'
    if f'ISB_{senkou_span_displacement}' in ichimoku_df.columns:
        senkou_b_col_actual = f'ISB_{senkou_span_displacement}'
    elif 'ISB' in ichimoku_df.columns:
        senkou_b_col_actual = 'ISB'

    chikou_col_actual = f'ICS_{chikou_period}'
    if 'ICS' in ichimoku_df.columns:
        chikou_col_actual = 'ICS'

    def get_col_values(df, potential_names, default_len):
        for name in potential_names:
            if name in df.columns:
                return df[name].values
        return np.full(default_len, np.nan)

    return {
        'tenkan_sen': get_col_values(ichimoku_df, [tenkan_col_name, f'TENKAN_{tenkan_period}'], len(data_df)),
        'kijun_sen': get_col_values(ichimoku_df, [kijun_col_name, f'KIJUN_{kijun_period}'], len(data_df)),
        'senkou_span_a': get_col_values(ichimoku_df,
                                        [senkou_a_col_actual, f'ISA_{tenkan_period}', f'ISA_{senkou_span_displacement}', 'ISA',
                                         'senkou_a'], len(data_df)),
        'senkou_span_b': get_col_values(ichimoku_df,
                                        [senkou_b_col_actual, f'ISB_{senkou_b_period}', f'ISB_{senkou_span_displacement}', 'ISB',
                                         'senkou_b'], len(data_df)),
        'chikou_span': get_col_values(ichimoku_df, [chikou_col_actual, f'ICS_{chikou_period}', 'ICS', 'chikou'],
                                      len(data_df)),
    }


def calculate_fibonacci_retracement(data_df, period=20, levels=None):
    if levels is None:
        levels = [0.0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0]

    if not isinstance(data_df, pd.DataFrame):
        data_df = pd.DataFrame(data_df)

    df_copy = data_df.copy()
    df_copy.columns = [str(col).lower() for col in df_copy.columns]

    if not all(col in df_copy.columns for col in ['high', 'low']):
        logger.warning("Fibonacci: Missing high or low columns.")
        nan_results = {}
        for level in levels:
            nan_results[f'level_{int(level * 1000)}'] = np.full(len(data_df), np.nan)
            nan_results[f'downtrend_level_{int(level * 1000)}'] = np.full(len(data_df), np.nan)
        return nan_results

    results = {}
    for level in levels:
        results[f'level_{int(level * 1000)}'] = np.full(len(data_df), np.nan)
        results[f'downtrend_level_{int(level * 1000)}'] = np.full(len(data_df), np.nan)

    if len(df_copy) < 2:
        return results

    recent_data = df_copy.tail(period)
    if len(recent_data) < 2:
        return results

    highest_high_price = recent_data['high'].max()
    lowest_low_price = recent_data['low'].min()

    if pd.isna(highest_high_price) or pd.isna(lowest_low_price):
        return results

    diff_uptrend = highest_high_price - lowest_low_price
    if diff_uptrend > 0:
        for level in levels:
            results[f'level_{int(level * 1000)}'][-1] = highest_high_price - (diff_uptrend * level)

    diff_downtrend = highest_high_price - lowest_low_price
    if diff_downtrend > 0:
        for level in levels:
            results[f'downtrend_level_{int(level * 1000)}'][-1] = lowest_low_price + (diff_downtrend * level)

    return results


def get_all_indicators(ohlcv_df_or_list, indicator_settings: dict = None) -> dict:
    if isinstance(ohlcv_df_or_list, list):
        if not ohlcv_df_or_list:
            return _convert_numpy_types_for_serialization({"timestamps": [], "error": "Input data list is empty"})
        try:
            df = pd.DataFrame(ohlcv_df_or_list)
        except Exception as e:
            logger.error(f"Error converting list of dicts to DataFrame: {e}")
            return _convert_numpy_types_for_serialization(
                {"timestamps": [], "error": f"DataFrame conversion error: {e}"})
    elif isinstance(ohlcv_df_or_list, pd.DataFrame):
        df = ohlcv_df_or_list.copy()
    else:
        logger.error("Input to get_all_indicators must be a pandas DataFrame or a list of dicts")
        return _convert_numpy_types_for_serialization({"timestamps": [], "error": "Invalid input data type"})

    if df.empty:
        logger.warning("Received empty DataFrame for indicator calculation.")
        return _convert_numpy_types_for_serialization({"timestamps": [], "error": "Input DataFrame is empty"})

    required_cols = ['timestamp', 'open', 'high', 'low', 'close', 'volume']
    for col in required_cols:
        if col not in df.columns:
            logger.error(f"Missing required column in input data: {col}")
            return _convert_numpy_types_for_serialization({
                "timestamps": df['timestamp'].tolist() if 'timestamp' in df.columns else [],
                "error": f"Missing column: {col}"
            })
    try:
        if 'timestamp' not in df.columns:
            raise ValueError("'timestamp' column is missing")
        df['datetime'] = pd.to_datetime(df['timestamp'], unit='ms', errors='coerce')
        df = df.set_index('datetime', drop=False)
        for col in ['open', 'high', 'low', 'close', 'volume']:
            df[col] = pd.to_numeric(df[col], errors='coerce')
        if df[['open', 'high', 'low', 'close']].isnull().all().any():
            logger.warning("One or more OHLC columns became all NaN after numeric conversion.")
    except Exception as e:
        logger.error(f"Error processing DataFrame for indicators: {e}", exc_info=True)
        return _convert_numpy_types_for_serialization({
            "timestamps": df['timestamp'].tolist() if 'timestamp' in df.columns else [],
            "error": f"Data processing error: {str(e)}"
        })

    close_prices_series = df['close']

    if close_prices_series.dropna().empty:
        logger.warning("Close prices are all NaN after processing, cannot calculate indicators.")
        empty_indicators_payload = {"timestamps": df['timestamp'].tolist()}
        empty_indicators_payload['rsi'] = {}
        empty_indicators_payload['ema'] = {}
        empty_indicators_payload['sma'] = {}
        empty_indicators_payload['macd'] = []
        empty_indicators_payload['bollinger_bands'] = []
        empty_indicators_payload['adx_line'] = [None] * len(df)
        empty_indicators_payload['atr_line'] = [None] * len(df)
        empty_indicators_payload['ichimoku_cloud'] = {
            'tenkan_sen': [None] * len(df), 'kijun_sen': [None] * len(df),
            'senkou_span_a': [None] * len(df), 'senkou_span_b': [None] * len(df),
            'chikou_span': [None] * len(df)
        }
        default_fib_levels = [0.0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0]
        empty_fib_levels_uptrend = {f'level_{int(level * 1000)}': [None] * len(df) for level in default_fib_levels}
        empty_fib_levels_downtrend = {f'downtrend_level_{int(level * 1000)}': [None] * len(df) for level in
                                      default_fib_levels}
        empty_indicators_payload['fibonacci_retracement'] = {**empty_fib_levels_uptrend, **empty_fib_levels_downtrend}
        empty_indicators_payload['vwap_line'] = [None] * len(df)
        empty_indicators_payload['trend_status'] = {'current_trend': 'UNDETERMINED', 'sma50_gt_sma200': None,
                                                    'details': [None] * len(df)}
        empty_indicators_payload['volatility'] = {'atr_percentage': [None] * len(df), 'current_atr_percentage': None}
        return _convert_numpy_types_for_serialization(empty_indicators_payload)

    results = {'timestamps': df['timestamp'].tolist()}
    if indicator_settings is None:
        indicator_settings = {
            "rsi_periods": [14], "ema_periods": [9, 21, 50, 200], "sma_periods": [10, 20, 50, 200],
            "macd_params": [{"fast": 12, "slow": 26, "signal": 9}],
            "bollinger_params": [{"period": 20, "num_std_dev": 2.0}],
            "adx_period": 14,
            "atr_period": 14,
            "ichimoku_params": {"tenkan": 9, "kijun": 26, "senkou_b": 52, "chikou": 26, "displacement": 26},
            "fibonacci_params": {"period": 20, "levels": [0.0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0]},
            "vwap_enabled": True,
            "atr_period_for_volatility": 14
        }

    calc_close_prices = df['close'].dropna()
    if calc_close_prices.empty:
        calc_close_prices = df['close']

    results['rsi'] = {}
    for period in indicator_settings.get("rsi_periods", []):
        rsi_series = calculate_rsi(calc_close_prices, period).reindex(df.index)
        results['rsi'][f'rsi_{period}'] = rsi_series.tolist()

    results['ema'] = {}
    for period in indicator_settings.get("ema_periods", []):
        ema_series = calculate_ema(calc_close_prices, period).reindex(df.index)
        results['ema'][f'ema_{period}'] = ema_series.tolist()

    results['sma'] = {}
    for period in indicator_settings.get("sma_periods", []):
        sma_series = calculate_sma(calc_close_prices, period).reindex(df.index)
        results['sma'][f'sma_{period}'] = sma_series.tolist()

    results['macd'] = []
    for params in indicator_settings.get("macd_params", []):
        macd_df_calc = calculate_macd(calc_close_prices, params["fast"], params["slow"], params["signal"])
        macd_df_reindexed = macd_df_calc.reindex(df.index)
        results['macd'].append({
            'params': f'{params["fast"]}_{params["slow"]}_{params["signal"]}',
            'macd_line': macd_df_reindexed['MACD'].tolist(),
            'signal_line': macd_df_reindexed['Signal'].tolist(),
            'histogram': macd_df_reindexed['Histogram'].tolist()
        })

    results['bollinger_bands'] = []
    for params in indicator_settings.get("bollinger_params", []):
        num_std = params.get("num_std_dev", params.get("std_dev", 2.0))
        bb_df_calc = calculate_bollinger_bands(calc_close_prices, params["period"], num_std)
        bb_df_reindexed = bb_df_calc.reindex(df.index)
        results['bollinger_bands'].append({
            'params': f'{params["period"]}_{num_std}',
            'middle_band': bb_df_reindexed['Middle'].tolist(),
            'upper_band': bb_df_reindexed['Upper'].tolist(),
            'lower_band': bb_df_reindexed['Lower'].tolist()
        })

    adx_period_setting = indicator_settings.get("adx_period", 14)
    adx_values_arr = calculate_adx(df, adx_period_setting)
    results['adx_line'] = pd.Series(adx_values_arr, index=df.index).tolist()

    atr_period_setting = indicator_settings.get("atr_period", 14)
    atr_values_arr = calculate_atr(df, atr_period_setting)
    results['atr_line'] = pd.Series(atr_values_arr, index=df.index).tolist()

    ichimoku_setting = indicator_settings.get("ichimoku_params")
    if ichimoku_setting:
        ichimoku_data = calculate_ichimoku_cloud(
            df,
            tenkan_period=ichimoku_setting.get("tenkan", 9),
            kijun_period=ichimoku_setting.get("kijun", 26),
            senkou_b_period=ichimoku_setting.get("senkou_b", 52),
            chikou_period=ichimoku_setting.get("chikou", 26),
            senkou_span_displacement=ichimoku_setting.get("displacement", 26)
        )
        results['ichimoku_cloud'] = {
            k: pd.Series(v, index=df.index).tolist() for k, v in ichimoku_data.items()
        }
    else:
        results['ichimoku_cloud'] = {
            'tenkan_sen': [None] * len(df), 'kijun_sen': [None] * len(df),
            'senkou_span_a': [None] * len(df), 'senkou_span_b': [None] * len(df),
            'chikou_span': [None] * len(df)
        }

    fibonacci_setting = indicator_settings.get("fibonacci_params")
    if fibonacci_setting:
        fib_data = calculate_fibonacci_retracement(
            df,
            period=fibonacci_setting.get("period", 20),
            levels=fibonacci_setting.get("levels")
        )
        results['fibonacci_retracement'] = {
            k: pd.Series(v, index=df.index).tolist() for k, v in fib_data.items()
        }
    else:
        default_fib_levels = indicator_settings.get("fibonacci_params", {}).get("levels",
                                                                                [0.0, 0.236, 0.382, 0.5, 0.618, 0.786,
                                                                                 1.0])
        empty_fib_data_up = {f'level_{int(level * 1000)}': [None] * len(df) for level in default_fib_levels}
        empty_fib_data_down = {f'downtrend_level_{int(level * 1000)}': [None] * len(df) for level in default_fib_levels}
        results['fibonacci_retracement'] = {**empty_fib_data_up, **empty_fib_data_down}

    if indicator_settings.get("vwap_enabled", True):
        vwap_values_arr = calculate_vwap(df)
        results['vwap_line'] = pd.Series(vwap_values_arr, index=df.index).tolist()
    else:
        results['vwap_line'] = [None] * len(df)

    sma50 = calculate_sma(calc_close_prices, 50).reindex(df.index)
    sma200 = calculate_sma(calc_close_prices, 200).reindex(df.index)
    trend_details_list = [None] * len(df)
    latest_trend_val = "UNDETERMINED"
    sma50_gt_sma200_val = None
    if not sma50.empty and not sma200.empty:
        trend_series = pd.Series("FLAT", index=df.index)
        valid_comparison = sma50.notna() & sma200.notna()
        trend_series[valid_comparison & (sma50 > sma200)] = "UPTREND"
        trend_series[valid_comparison & (sma50 < sma200)] = "DOWNTREND"
        trend_details_list = trend_series.tolist()
        if valid_comparison.any():
            last_valid_series_index = trend_series[valid_comparison].last_valid_index()
            if last_valid_series_index is not None:
                latest_trend_val = trend_series[last_valid_series_index]
                sma50_val_at_idx = sma50[last_valid_series_index]
                sma200_val_at_idx = sma200[last_valid_series_index]
                if pd.notna(sma50_val_at_idx) and pd.notna(sma200_val_at_idx):
                    sma50_gt_sma200_val = bool(sma50_val_at_idx > sma200_val_at_idx)

    results['trend_status'] = {
        'current_trend': latest_trend_val,
        'sma50_gt_sma200': sma50_gt_sma200_val,
        'details': trend_details_list
    }

    atr_period_vol = indicator_settings.get("atr_period_for_volatility")
    current_atr_perc = None
    volatility_percentage_list = [None] * len(df)

    if atr_period_vol:
        if all(col in df.columns for col in ['high', 'low', 'close']):
            atr_values_for_vol_arr = calculate_atr(df, atr_period_vol)
            atr_val_series = pd.Series(atr_values_for_vol_arr, index=df.index)
            df_close_for_vol_calc = df['close'].replace(0, np.nan)
            if not atr_val_series.empty and not df_close_for_vol_calc.empty and not df_close_for_vol_calc.isnull().all():
                volatility_percentage = (atr_val_series / df_close_for_vol_calc) * 100
                volatility_percentage_list = volatility_percentage.tolist()
                last_valid_atr_perc = volatility_percentage.ffill().iloc[
                    -1] if not volatility_percentage.empty and volatility_percentage.notna().any() else None
                if pd.notna(last_valid_atr_perc):
                    current_atr_perc = float(last_valid_atr_perc)
            else:
                logger.warning("ATR or Close series for volatility calculation was empty or all NaN.")
        else:
            logger.warning("Missing high, low, or close columns in df for ATR volatility calculation.")

    results['volatility'] = {
        'atr_percentage': volatility_percentage_list,
        'current_atr_percentage': current_atr_perc
    }

    final_results = _convert_numpy_types_for_serialization(results)
    return final_results


def generate_trading_signals(indicator_data: dict, prices_df: pd.DataFrame) -> pd.Series:
    num_points = len(indicator_data.get('timestamps', []))
    if num_points == 0:
        return pd.Series([{'type': 'HOLD', 'reliability': 0.0, 'reason': 'No data'}] * 0, dtype=object)

    try:
        datetime_index = pd.to_datetime(indicator_data['timestamps'], unit='ms')
    except Exception as e:
        logger.error(f"Error converting timestamps for signals: {e}")
        # Create a default index if datetime_index conversion fails but num_points is > 0
        fallback_index = pd.RangeIndex(start=0, stop=num_points, step=1)
        return pd.Series([{'type': 'HOLD', 'reliability': 0.0, 'reason': 'Timestamp error'}] * num_points,
                         index=fallback_index, dtype=object)

    signals_output = [{'type': 'HOLD', 'reliability': 0.1, 'reason': 'Neutral'} for _ in
                      range(num_points)]
    def get_series_from_data(main_key, sub_key=None, data_dict=None, length=num_points, idx=datetime_index):
        source = data_dict if data_dict is not None else indicator_data

        if sub_key:
            data_list = source.get(main_key, {}).get(sub_key, [])
        else:
            data_list = source.get(main_key, [])

        if not isinstance(data_list, list): data_list = []

        if len(data_list) != length:
            logger.warning(f"Length mismatch for {main_key + ('.' + sub_key if sub_key else '')}. Expected {length}, got {len(data_list)}. Padding/truncating.")
            padded_list = [np.nan] * length
            for i in range(min(len(data_list), length)):
                padded_list[i] = data_list[i]
            data_list = padded_list

        return pd.Series([x if x is not None else np.nan for x in data_list], index=idx)

    # RSI
    rsi_data_dict = indicator_data.get('rsi', {})
    rsi_key_to_use = next((k for p in [14, 7, 21] for k in [f'rsi_{p}'] if k in rsi_data_dict and rsi_data_dict[k]),
                          None)
    if not rsi_key_to_use and rsi_data_dict: rsi_key_to_use = next(iter(rsi_data_dict), None)  # Fallback
    rsi_values = get_series_from_data('rsi', rsi_key_to_use) if rsi_key_to_use else pd.Series([np.nan] * num_points,
                                                                                              index=datetime_index)

    # MACD
    macd_sets = indicator_data.get('macd', [])
    macd_data = macd_sets[0] if macd_sets and isinstance(macd_sets, list) and macd_sets[0] else {}
    macd_line = get_series_from_data('macd_line', data_dict=macd_data)
    signal_line = get_series_from_data('signal_line', data_dict=macd_data)

    # Prices
    close_prices = pd.Series([np.nan] * num_points, index=datetime_index)
    if 'close' in prices_df.columns:
        temp_prices_df_for_close = prices_df.copy()
        try:
            if not isinstance(temp_prices_df_for_close.index,
                              pd.DatetimeIndex) or not temp_prices_df_for_close.index.equals(datetime_index):
                if 'timestamp' in temp_prices_df_for_close.columns:
                    temp_prices_df_for_close['datetime_idx_col'] = pd.to_datetime(temp_prices_df_for_close['timestamp'],
                                                                                  unit='ms', errors='coerce')
                    temp_prices_df_for_close = temp_prices_df_for_close.set_index('datetime_idx_col', drop=True)
                else:
                    temp_prices_df_for_close.index = datetime_index

            close_prices = temp_prices_df_for_close['close'].reindex(datetime_index).ffill()
        except Exception as e_price_idx:
            logger.error(f"Error aligning price data index: {e_price_idx}. Close prices may be inaccurate.")
            if len(prices_df['close']) == num_points:
                close_prices = pd.Series(prices_df['close'].values, index=datetime_index).ffill()

    # Other Indicators
    adx_line_series = get_series_from_data('adx_line')
    vwap_line_series = get_series_from_data('vwap_line')

    ichimoku_data_dict = indicator_data.get('ichimoku_cloud', {})
    tenkan_sen = get_series_from_data('tenkan_sen', data_dict=ichimoku_data_dict)
    kijun_sen = get_series_from_data('kijun_sen', data_dict=ichimoku_data_dict)
    senkou_a = get_series_from_data('senkou_span_a', data_dict=ichimoku_data_dict)
    senkou_b = get_series_from_data('senkou_span_b', data_dict=ichimoku_data_dict)

    for i in range(num_points):
        current_reliability = 0.0
        reasons = []
        current_signal_type = 'HOLD'

        rsi_val = rsi_values.iloc[i]
        is_rsi_buy = pd.notna(rsi_val) and rsi_val < 30
        is_rsi_sell = pd.notna(rsi_val) and rsi_val > 70
        if is_rsi_buy: reasons.append(f"RSI({rsi_val:.0f})<30")
        if is_rsi_sell: reasons.append(f"RSI({rsi_val:.0f})>70")

        macd_val = macd_line.iloc[i];
        macd_signal_val = signal_line.iloc[i]
        macd_prev_val = macd_line.shift(1).iloc[i];
        macd_signal_prev_val = signal_line.shift(1).iloc[i]
        is_macd_buy_cross = pd.notna(macd_val) and pd.notna(macd_signal_val) and pd.notna(macd_prev_val) and pd.notna(
            macd_signal_prev_val) and macd_val > macd_signal_val and macd_prev_val <= macd_signal_prev_val
        is_macd_sell_cross = pd.notna(macd_val) and pd.notna(macd_signal_val) and pd.notna(macd_prev_val) and pd.notna(
            macd_signal_prev_val) and macd_val < macd_signal_val and macd_prev_val >= macd_signal_prev_val
        if is_macd_buy_cross: reasons.append("MACD_BuyX")
        if is_macd_sell_cross: reasons.append("MACD_SellX")

        if is_rsi_buy and is_macd_buy_cross:
            current_signal_type = 'BUY'; current_reliability = 0.60
        elif is_rsi_sell and is_macd_sell_cross:
            current_signal_type = 'SELL'; current_reliability = 0.60
        elif is_macd_buy_cross:
            current_signal_type = 'BUY'; current_reliability = 0.45
        elif is_macd_sell_cross:
            current_signal_type = 'SELL'; current_reliability = 0.45
        elif is_rsi_buy:
            current_signal_type = 'BUY'; current_reliability = 0.35
        elif is_rsi_sell:
            current_signal_type = 'SELL'; current_reliability = 0.35
        else:
            current_signal_type = 'HOLD'; current_reliability = 0.10

        adx_val = adx_line_series.iloc[i]
        if pd.notna(adx_val):
            reasons.append(f"ADX({adx_val:.0f})")
            if adx_val > 25:
                current_reliability += 0.15 * (
                    1 if current_signal_type != 'HOLD' else 0.5)
            elif adx_val > 20:
                current_reliability += 0.10 * (1 if current_signal_type != 'HOLD' else 0.5)

        price_val = close_prices.iloc[i]
        vwap_val = vwap_line_series.iloc[i]
        if pd.notna(price_val) and pd.notna(vwap_val):
            if price_val > vwap_val: reasons.append("P>VWAP")
            if price_val < vwap_val: reasons.append("P<VWAP")
            if current_signal_type == 'BUY' and price_val > vwap_val: current_reliability += 0.10
            if current_signal_type == 'SELL' and price_val < vwap_val: current_reliability += 0.10

        sa_val = senkou_a.iloc[i];
        sb_val = senkou_b.iloc[i];
        tk_val = tenkan_sen.iloc[i];
        kj_val = kijun_sen.iloc[i]
        if pd.notna(price_val) and pd.notna(sa_val) and pd.notna(sb_val):
            if price_val > max(sa_val, sb_val): reasons.append("P>Kumo")
            if price_val < min(sa_val, sb_val): reasons.append("P<Kumo")
            if current_signal_type == 'BUY' and price_val > max(sa_val, sb_val): current_reliability += 0.10
            if current_signal_type == 'SELL' and price_val < min(sa_val, sb_val): current_reliability += 0.10

        if pd.notna(tk_val) and pd.notna(kj_val) and pd.notna(tenkan_sen.shift(1).iloc[i]) and pd.notna(
                kijun_sen.shift(1).iloc[i]):
            tk_cross_kj_bullish = tk_val > kj_val and tenkan_sen.shift(1).iloc[i] <= kijun_sen.shift(1).iloc[i]
            tk_cross_kj_bearish = tk_val < kj_val and tenkan_sen.shift(1).iloc[i] >= kijun_sen.shift(1).iloc[i]
            if tk_cross_kj_bullish: reasons.append("TKxKJ_Buy")
            if tk_cross_kj_bearish: reasons.append("TKxKJ_Sell")
            if current_signal_type == 'BUY' and tk_cross_kj_bullish: current_reliability += 0.15  # Cross is a strong signal
            if current_signal_type == 'SELL' and tk_cross_kj_bearish: current_reliability += 0.15

        if i == num_points - 1 and pd.notna(price_val):
            fib_data = indicator_data.get('fibonacci_retracement', {})
            if fib_data:
                for fib_name_key, fib_val_list_at_i in fib_data.items():
                    if isinstance(fib_val_list_at_i, list) and len(fib_val_list_at_i) > i:
                        fib_level_val_at_i = fib_val_list_at_i[i]  # Get Fib level for current point i
                        if pd.notna(fib_level_val_at_i) and abs(price_val - fib_level_val_at_i) / price_val < 0.005:
                            clean_fib_name = fib_name_key.replace('level_', '').replace('downtrend_', 'dt_')
                            reasons.append(f"NearFib_{clean_fib_name}({fib_level_val_at_i:.2f})")

        final_reason = ", ".join(sorted(list(set(reasons)))) if reasons else (
            "Neutral" if current_signal_type == 'HOLD' else "Signal")

        signals_output[i] = {
            'type': current_signal_type,
            'reliability': round(max(0.0, min(1.0, current_reliability)), 2),
            'reason': final_reason
        }

    final_signals = pd.Series(signals_output, index=datetime_index)
    return final_signals.apply(lambda x: x if isinstance(x, dict) else {'type': 'HOLD', 'reliability': 0.0,
                                                                        'reason': 'Signal processing error'})