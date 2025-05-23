# indicators/technical_indicators.py
import pandas as pd
import numpy as np
import logging

logger = logging.getLogger(__name__)


def _convert_numpy_types_for_serialization(data):
    if isinstance(data, list):
        return [_convert_numpy_types_for_serialization(x) for x in data]
    elif isinstance(data, dict):
        return {k: _convert_numpy_types_for_serialization(v) for k, v in data.items()}
    elif isinstance(data, np.bool_):
        return bool(data)  # Конвертуємо numpy.bool_ в Python bool
    elif isinstance(data, np.integer):
        return int(data)  # Конвертуємо numpy integer в Python int
    elif isinstance(data, np.floating):
        if np.isnan(data) or np.isinf(data):
            return None  # NaN/inf з numpy float стають None
        return float(data)  # Конвертуємо numpy float в Python float
    elif isinstance(data, float):  # Обробка стандартних Python float NaN/inf
        if np.isnan(data) or np.isinf(data):
            return None
    return data


# --- Ваші функції calculate_sma, calculate_ema, etc. ---
# (Залишаються такими ж, як у вашому останньому наданому файлі,
#  або з правками з моєї попередньої відповіді для кращої обробки NaN на етапі розрахунку)

def calculate_sma(prices: pd.Series, period: int) -> pd.Series:
    if prices.empty or len(prices) < 1:
        return pd.Series([np.nan] * len(prices), index=prices.index, dtype=float)
    return prices.rolling(window=period, min_periods=1).mean()


def calculate_ema(prices: pd.Series, period: int) -> pd.Series:
    if prices.empty:
        return pd.Series([np.nan] * len(prices), index=prices.index, dtype=float)
    return prices.ewm(span=period, adjust=False, min_periods=1).mean()


def calculate_rsi(prices: pd.Series, period: int = 14) -> pd.Series:
    if prices.empty or len(prices) < 2:
        return pd.Series([np.nan] * len(prices), index=prices.index, dtype=float)
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
    rsi.loc[(avg_gain == 0) & (avg_loss == 0)] = 50.0
    return rsi


def calculate_macd(prices: pd.Series, fast_period: int = 12, slow_period: int = 26,
                   signal_period: int = 9) -> pd.DataFrame:
    if prices.empty:
        return pd.DataFrame(columns=['MACD', 'Signal', 'Histogram'], index=prices.index, dtype=float)
    ema_fast = calculate_ema(prices, fast_period)
    ema_slow = calculate_ema(prices, slow_period)
    macd_line = ema_fast - ema_slow
    signal_line_calculated = calculate_ema(macd_line.dropna(), signal_period)
    df = pd.DataFrame(index=prices.index)
    df['MACD'] = macd_line
    df['Signal'] = signal_line_calculated
    df['Signal'] = df['Signal'].reindex(df.index)
    df['Histogram'] = df['MACD'] - df['Signal']
    return df


def calculate_bollinger_bands(prices: pd.Series, period: int = 20, num_std_dev: float = 2.0) -> pd.DataFrame:
    if prices.empty:
        return pd.DataFrame(columns=['Middle', 'Upper', 'Lower'], index=prices.index, dtype=float)
    middle_band = calculate_sma(prices, period)
    rolling_std = prices.rolling(window=period, min_periods=1).std()
    upper_band = middle_band + (rolling_std * num_std_dev)
    lower_band = middle_band - (rolling_std * num_std_dev)
    return pd.DataFrame({'Middle': middle_band, 'Upper': upper_band, 'Lower': lower_band})


def calculate_atr(high_prices: pd.Series, low_prices: pd.Series, close_prices: pd.Series,
                  period: int = 14) -> pd.Series:
    if high_prices.empty or low_prices.empty or close_prices.empty or len(close_prices) < 2:
        return pd.Series([np.nan] * len(close_prices), index=close_prices.index, dtype=float)
    prev_close = close_prices.shift(1)
    tr1 = high_prices - low_prices
    tr2 = np.abs(high_prices - prev_close)
    tr3 = np.abs(low_prices - prev_close)
    true_range = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1, skipna=False)
    atr = true_range.ewm(com=period - 1, adjust=False, min_periods=period).mean()
    return atr


def calculate_adx(high_prices: pd.Series, low_prices: pd.Series, close_prices: pd.Series,
                  period: int = 14) -> pd.DataFrame:
    if high_prices.empty or low_prices.empty or close_prices.empty or len(close_prices) < period + 1:
        nan_series = pd.Series([np.nan] * len(close_prices), index=close_prices.index, dtype=float)
        return pd.DataFrame({'ADX': nan_series, 'PDI': nan_series, 'MDI': nan_series})
    up_move = high_prices.diff()
    down_move = -low_prices.diff()
    plus_dm = pd.Series(np.where((up_move > down_move) & (up_move > 0), up_move, 0.0), index=high_prices.index)
    minus_dm = pd.Series(np.where((down_move > up_move) & (down_move > 0), down_move, 0.0), index=high_prices.index)
    smooth_plus_dm = plus_dm.ewm(com=period - 1, adjust=False, min_periods=period).mean()
    smooth_minus_dm = minus_dm.ewm(com=period - 1, adjust=False, min_periods=period).mean()
    atr_val = calculate_atr(high_prices, low_prices, close_prices, period)
    atr_safe = atr_val.replace(0, np.nan)
    pdi = (smooth_plus_dm / atr_safe) * 100
    mdi = (smooth_minus_dm / atr_safe) * 100
    dx_denominator = (pdi + mdi).replace(0, np.nan).replace([np.inf, -np.inf], np.nan)
    dx = (np.abs(pdi - mdi) / dx_denominator) * 100
    adx = dx.ewm(com=period - 1, adjust=False, min_periods=period).mean()
    df_result = pd.DataFrame(index=close_prices.index)
    df_result['ADX'] = adx
    df_result['PDI'] = pdi
    df_result['MDI'] = mdi
    df_result.replace([np.inf, -np.inf], np.nan, inplace=True)
    return df_result


def get_all_indicators(ohlcv_df_or_list, indicator_settings: dict = None) -> dict:
    # ... (початок функції, як у вашому файлі, з перевірками та створенням df) ...
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

    close_prices = df['close'].dropna()
    high_prices = df['high'].dropna()
    low_prices = df['low'].dropna()

    if close_prices.empty:  # Якщо після dropna нічого не залишилось
        logger.warning("Close prices are all NaN after processing, cannot calculate indicators.")
        # Повертаємо timestamps, але індикатори будуть порожні або None після _convert_numpy_types_for_serialization
        empty_indicators_payload = {"timestamps": df['timestamp'].tolist()}
        # Додаємо порожні структури для всіх очікуваних індикаторів, щоб фронтенд не падав
        empty_indicators_payload['rsi'] = {}
        empty_indicators_payload['ema'] = {}
        empty_indicators_payload['sma'] = {}
        empty_indicators_payload['macd'] = []
        empty_indicators_payload['bollinger_bands'] = []
        empty_indicators_payload['adx'] = {}
        empty_indicators_payload['trend_status'] = {'current_trend': 'UNDETERMINED', 'sma50_gt_sma200': None,
                                                    'details': []}
        empty_indicators_payload['volatility'] = {'atr_percentage': [], 'current_atr_percentage': None}
        return _convert_numpy_types_for_serialization(empty_indicators_payload)

    results = {'timestamps': df['timestamp'].tolist()}
    if indicator_settings is None:
        indicator_settings = {
            "rsi_periods": [14], "ema_periods": [9, 21, 50, 200], "sma_periods": [10, 20, 50, 200],
            "macd_params": [{"fast": 12, "slow": 26, "signal": 9}],
            "bollinger_params": [{"period": 20, "num_std_dev": 2.0}],
            "adx_period": 14, "atr_period_for_volatility": 14
        }

    # RSI, EMA, SMA (як у вашому файлі, з .reindex(df.index).tolist())
    results['rsi'] = {}
    for period in indicator_settings.get("rsi_periods", []):
        rsi_series = calculate_rsi(close_prices, period).reindex(df.index)
        results['rsi'][f'rsi_{period}'] = rsi_series.tolist()

    results['ema'] = {}
    for period in indicator_settings.get("ema_periods", []):
        ema_series = calculate_ema(close_prices, period).reindex(df.index)
        results['ema'][f'ema_{period}'] = ema_series.tolist()

    results['sma'] = {}
    for period in indicator_settings.get("sma_periods", []):
        sma_series = calculate_sma(close_prices, period).reindex(df.index)
        results['sma'][f'sma_{period}'] = sma_series.tolist()

    # MACD
    results['macd'] = []
    for params in indicator_settings.get("macd_params", []):
        macd_df_calc = calculate_macd(close_prices, params["fast"], params["slow"], params["signal"])
        macd_df_reindexed = macd_df_calc.reindex(df.index)  # Reindex перед tolist
        results['macd'].append({
            'params': f'{params["fast"]}_{params["slow"]}_{params["signal"]}',
            'macd_line': macd_df_reindexed['MACD'].tolist(),
            'signal_line': macd_df_reindexed['Signal'].tolist(),
            'histogram': macd_df_reindexed['Histogram'].tolist()
        })

    # Bollinger Bands
    results['bollinger_bands'] = []
    for params in indicator_settings.get("bollinger_params", []):
        num_std = params.get("num_std_dev", params.get("std_dev", 2.0))
        bb_df_calc = calculate_bollinger_bands(close_prices, params["period"], num_std)
        bb_df_reindexed = bb_df_calc.reindex(df.index)  # Reindex
        results['bollinger_bands'].append({
            'params': f'{params["period"]}_{num_std}',
            'middle_band': bb_df_reindexed['Middle'].tolist(),
            'upper_band': bb_df_reindexed['Upper'].tolist(),
            'lower_band': bb_df_reindexed['Lower'].tolist()
        })

    # ADX
    adx_period_setting = indicator_settings.get("adx_period")
    # Створюємо порожню структуру ADX за замовчуванням
    adx_key = f'adx_{adx_period_setting}' if adx_period_setting else 'adx_default'
    pdi_key = f'pdi_{adx_period_setting}' if adx_period_setting else 'pdi_default'
    mdi_key = f'mdi_{adx_period_setting}' if adx_period_setting else 'mdi_default'
    results['adx'] = {
        adx_key: [None] * len(df),
        pdi_key: [None] * len(df),
        mdi_key: [None] * len(df)
    }
    if adx_period_setting and not high_prices.empty and not low_prices.empty and not close_prices.empty:
        common_index = high_prices.index.intersection(low_prices.index).intersection(close_prices.index)
        if not common_index.empty:
            adx_df_calc = calculate_adx(high_prices.loc[common_index], low_prices.loc[common_index],
                                        close_prices.loc[common_index], adx_period_setting)
            adx_df_reindexed = adx_df_calc.reindex(df.index)  # Reindex
            results['adx'] = {
                f'adx_{adx_period_setting}': adx_df_reindexed['ADX'].tolist(),
                f'pdi_{adx_period_setting}': adx_df_reindexed['PDI'].tolist(),
                f'mdi_{adx_period_setting}': adx_df_reindexed['MDI'].tolist()
            }
        else:
            logger.warning("Cannot calculate ADX due to empty common index for OHLC data.")
            # results['adx'] вже ініціалізовано списками None

    # Trend Status
    sma50 = calculate_sma(close_prices, 50).reindex(df.index)
    sma200 = calculate_sma(close_prices, 200).reindex(df.index)
    # ... (решта логіки trend_status, забезпечуючи .tolist() в кінці)
    trend_details_list = [None] * len(df)
    latest_trend_val = "UNDETERMINED"
    sma50_gt_sma200_val = None  # Має бути Python bool або None
    if not sma50.empty and not sma200.empty:
        trend_series = pd.Series("FLAT", index=df.index)
        valid_comparison = sma50.notna() & sma200.notna()
        trend_series[valid_comparison & (sma50 > sma200)] = "UPTREND"
        trend_series[valid_comparison & (sma50 < sma200)] = "DOWNTREND"
        trend_details_list = trend_series.tolist()
        if valid_comparison.any():
            last_valid_idx = df.index[valid_comparison].max()
            if last_valid_idx is not pd.NaT:
                latest_trend_val = trend_series[last_valid_idx]
                # Конвертуємо numpy.bool_ в Python bool
                sma50_val_at_idx = sma50[last_valid_idx]
                sma200_val_at_idx = sma200[last_valid_idx]
                if pd.notna(sma50_val_at_idx) and pd.notna(sma200_val_at_idx):
                    sma50_gt_sma200_val = bool(sma50_val_at_idx > sma200_val_at_idx)

    results['trend_status'] = {
        'current_trend': latest_trend_val,
        'sma50_gt_sma200': sma50_gt_sma200_val,  # Тепер це Python bool або None
        'details': trend_details_list
    }

    # Volatility
    atr_period_vol = indicator_settings.get("atr_period_for_volatility")
    current_atr_perc = None
    volatility_percentage_list = [None] * len(df)
    if atr_period_vol and not high_prices.empty and not low_prices.empty and not close_prices.empty:
        common_index_atr = high_prices.index.intersection(low_prices.index).intersection(close_prices.index)
        if not common_index_atr.empty:
            atr_val = calculate_atr(high_prices.loc[common_index_atr], low_prices.loc[common_index_atr],
                                    close_prices.loc[common_index_atr], atr_period_vol).reindex(df.index)
            close_prices_safe = close_prices.reindex(df.index).replace(0, np.nan)
            volatility_percentage = (atr_val / close_prices_safe) * 100
            volatility_percentage_list = volatility_percentage.tolist()  # Це вже список float з можливими nan
            if not volatility_percentage.empty:
                last_val_atr_perc = volatility_percentage.iloc[-1]  # Може бути nan
                if pd.notna(last_val_atr_perc):  # Перевіряємо, чи не nan
                    current_atr_perc = float(last_val_atr_perc)  # Конвертуємо в Python float

    results['volatility'] = {
        'atr_percentage': volatility_percentage_list,
        'current_atr_percentage': current_atr_perc  # Python float або None
    }

    # Логування перед фінальним очищенням (як ви просили)
    # ... (додайте ваше логування тут, якщо потрібно, для results) ...

    final_results = _convert_numpy_types_for_serialization(results)  # Використовуємо нову функцію

    # Логування після фінального очищення
    if final_results.get('adx'):
        logger.debug(f"ADX data AFTER cleaning: {final_results['adx']}")
    if final_results.get('macd') and final_results['macd']:
        logger.debug(f"MACD set 0 signal_line AFTER cleaning: {final_results['macd'][0].get('signal_line')}")

    return final_results


# generate_trading_signals залишається як є, але тепер вона отримуватиме дані, де numpy типи вже конвертовані
def generate_trading_signals(indicator_data: dict, prices_df: pd.DataFrame) -> pd.Series:
    # ... (код generate_trading_signals як у вашому файлі) ...
    # Переконайтеся, що він коректно обробляє None замість NaN
    num_points = len(indicator_data.get('timestamps', []))
    if num_points == 0:
        return pd.Series(dtype=str)

    try:
        datetime_index = pd.to_datetime(indicator_data['timestamps'], unit='ms')
    except Exception as e:
        logger.error(f"Error converting timestamps for signals: {e}")
        return pd.Series(['HOLD'] * num_points)

    signals = pd.Series(['HOLD'] * num_points, index=datetime_index)

    try:
        rsi_data = indicator_data.get('rsi', {})
        rsi_key_options = [f'rsi_{p}' for p in [14, 7, 5]]
        rsi_key_to_use = next((k for k in rsi_key_options if k in rsi_data and rsi_data[k]), None)

        if not rsi_key_to_use or not rsi_data.get(rsi_key_to_use):
            logger.warning("No suitable RSI data found or RSI data is empty for signal generation.")
            return signals.fillna('HOLD')

        rsi_values_list = rsi_data.get(rsi_key_to_use, [])
        rsi_values = pd.Series([x if x is not None else np.nan for x in rsi_values_list], index=datetime_index)

        macd_sets = indicator_data.get('macd', [])
        if macd_sets and macd_sets[0].get('macd_line'):
            macd_data = macd_sets[0]
            macd_line_list = macd_data.get('macd_line', [])
            signal_line_list = macd_data.get('signal_line', [])

            macd_line = pd.Series([x if x is not None else np.nan for x in macd_line_list], index=datetime_index)
            signal_line = pd.Series([x if x is not None else np.nan for x in signal_line_list], index=datetime_index)

            if not (rsi_values.isna().all() or macd_line.isna().all() or signal_line.isna().all()):
                macd_prev = macd_line.shift(1)
                signal_prev = signal_line.shift(1)

                buy_condition = (rsi_values < 30) & (macd_line > signal_line) & (macd_prev < signal_prev)
                signals[buy_condition] = 'BUY'

                sell_condition = (rsi_values > 70) & (macd_line < signal_line) & (macd_prev > signal_prev)
                signals[sell_condition] = 'SELL'
        else:
            logger.info("MACD data not found or is empty for signal generation.")

    except Exception as e:
        logger.error(f"Error generating trading signals: {e}", exc_info=True)

    return signals.fillna('HOLD')
