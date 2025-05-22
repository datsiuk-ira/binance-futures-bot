# indicators/technical_indicators.py
import pandas as pd
import numpy as np


def calculate_sma(prices: pd.Series, period: int) -> pd.Series:
    """Calculates Simple Moving Average (SMA)."""
    if prices.empty or len(prices) < period:
        return pd.Series(dtype=float)
    return prices.rolling(window=period, min_periods=period).mean()


def calculate_ema(prices: pd.Series, period: int) -> pd.Series:
    """Calculates Exponential Moving Average (EMA)."""
    if prices.empty or len(prices) < period:
        return pd.Series(dtype=float)
    return prices.ewm(span=period, adjust=False, min_periods=period).mean()


def calculate_rsi(prices: pd.Series, period: int = 14) -> pd.Series:
    """Calculates Relative Strength Index (RSI)."""
    if prices.empty or len(prices) < period + 1:
        return pd.Series(dtype=float)
    delta = prices.diff()
    gain = (delta.where(delta > 0, 0)).rolling(window=period).mean()
    loss = (-delta.where(delta < 0, 0)).rolling(window=period).mean()

    rs = gain / loss
    rsi = 100 - (100 / (1 + rs))
    rsi = rsi.fillna(method='bfill')  # Fill initial NaNs if any reasonable way
    return rsi


def calculate_macd(prices: pd.Series, fast_period: int = 12, slow_period: int = 26,
                   signal_period: int = 9) -> pd.DataFrame:
    """Calculates Moving Average Convergence Divergence (MACD)."""
    if prices.empty or len(prices) < slow_period:
        return pd.DataFrame(columns=['MACD', 'Signal', 'Histogram'])

    ema_fast = calculate_ema(prices, fast_period)
    ema_slow = calculate_ema(prices, slow_period)

    macd_line = ema_fast - ema_slow
    signal_line = calculate_ema(macd_line, signal_period)
    histogram = macd_line - signal_line

    return pd.DataFrame({'MACD': macd_line, 'Signal': signal_line, 'Histogram': histogram})


def calculate_bollinger_bands(prices: pd.Series, period: int = 20, std_dev: float = 2.0) -> pd.DataFrame:
    """Calculates Bollinger Bands."""
    if prices.empty or len(prices) < period:
        return pd.DataFrame(columns=['Middle', 'Upper', 'Lower'])

    middle_band = calculate_sma(prices, period)
    rolling_std = prices.rolling(window=period, min_periods=period).std()
    upper_band = middle_band + (rolling_std * std_dev)
    lower_band = middle_band - (rolling_std * std_dev)

    return pd.DataFrame({'Middle': middle_band, 'Upper': upper_band, 'Lower': lower_band})


def calculate_atr(high_prices: pd.Series, low_prices: pd.Series, close_prices: pd.Series,
                  period: int = 14) -> pd.Series:
    """Calculates Average True Range (ATR)."""
    if high_prices.empty or len(high_prices) < period or \
            low_prices.empty or len(low_prices) < period or \
            close_prices.empty or len(close_prices) < period:
        return pd.Series(dtype=float)

    prev_close = close_prices.shift(1)
    tr1 = high_prices - low_prices
    tr2 = np.abs(high_prices - prev_close)
    tr3 = np.abs(low_prices - prev_close)

    true_range = pd.DataFrame({'tr1': tr1, 'tr2': tr2, 'tr3': tr3}).max(axis=1)
    atr = true_range.ewm(alpha=1 / period, adjust=False, min_periods=period).mean()  # Wilder's smoothing
    return atr


def calculate_adx(high_prices: pd.Series, low_prices: pd.Series, close_prices: pd.Series,
                  period: int = 14) -> pd.DataFrame:
    """Calculates Average Directional Index (ADX)."""
    if high_prices.empty or len(high_prices) < period + 1 or \
            low_prices.empty or len(low_prices) < period + 1 or \
            close_prices.empty or len(close_prices) < period + 1:
        return pd.DataFrame(columns=['ADX', 'PDI', 'MDI'])

    # Calculate +DM, -DM
    up_move = high_prices.diff()
    down_move = low_prices.diff().mul(-1)  # Inverted to make it positive

    plus_dm = pd.Series(np.where((up_move > down_move) & (up_move > 0), up_move, 0.0), index=high_prices.index)
    minus_dm = pd.Series(np.where((down_move > up_move) & (down_move > 0), down_move, 0.0), index=high_prices.index)

    # Smoothed +DM, -DM using Wilder's EMA
    smooth_plus_dm = plus_dm.ewm(alpha=1 / period, adjust=False, min_periods=period).mean()
    smooth_minus_dm = minus_dm.ewm(alpha=1 / period, adjust=False, min_periods=period).mean()

    atr = calculate_atr(high_prices, low_prices, close_prices, period)

    # Avoid division by zero if ATR is zero
    atr_safe = atr.replace(0, np.nan)  # Replace 0 with NaN to propagate it correctly

    pdi = (smooth_plus_dm / atr_safe) * 100  # Positive Directional Indicator
    mdi = (smooth_minus_dm / atr_safe) * 100  # Negative Directional Indicator

    dx = (np.abs(pdi - mdi) / (pdi + mdi).replace(0, np.nan)) * 100
    adx = dx.ewm(alpha=1 / period, adjust=False, min_periods=period).mean()  # Smoothed DX is ADX

    return pd.DataFrame({'ADX': adx, 'PDI': pdi, 'MDI': mdi})


def get_all_indicators(ohlcv_df: pd.DataFrame, indicator_settings: dict = None) -> dict:
    """
    Calculates all specified indicators based on the OHLCV DataFrame.
    ohlcv_df should have columns: 'timestamp', 'open', 'high', 'low', 'close', 'volume'
    and 'timestamp' should be Unix milliseconds.
    """
    if ohlcv_df.empty:
        return {}

    df = ohlcv_df.copy()
    if not isinstance(df.index, pd.DatetimeIndex):
        df['datetime'] = pd.to_datetime(df['timestamp'], unit='ms')
        df = df.set_index('datetime')

    close_prices = df['close']
    high_prices = df['high']
    low_prices = df['low']

    results = {
        'timestamps': ohlcv_df['timestamp'].tolist()  # Keep original timestamps for mapping
    }

    # Default settings if none provided
    if indicator_settings is None:
        indicator_settings = {
            "rsi_periods": [5, 7, 14],
            "ema_periods": [9, 21, 50, 200],
            "macd_params": [{"fast": 12, "slow": 26, "signal": 9}, {"fast": 8, "slow": 17, "signal": 5}],
            "bollinger_params": [{"period": 10, "std_dev": 1.5}, {"period": 20, "std_dev": 2.0},
                                 {"period": 20, "std_dev": 2.5}],
            "adx_period": 14,
            "sma_periods": [10, 20, 50, 200]  # Added SMA as per description
        }

    # RSI
    results['rsi'] = {}
    for period in indicator_settings.get("rsi_periods", [14]):
        results['rsi'][f'rsi_{period}'] = calculate_rsi(close_prices, period).replace([np.inf, -np.inf], np.nan).fillna(
            method='bfill').fillna(method='ffill').tolist()

    # EMA
    results['ema'] = {}
    for period in indicator_settings.get("ema_periods", [9, 21, 50, 200]):
        results['ema'][f'ema_{period}'] = calculate_ema(close_prices, period).replace([np.inf, -np.inf], np.nan).fillna(
            method='bfill').fillna(method='ffill').tolist()

    # SMA
    results['sma'] = {}
    for period in indicator_settings.get("sma_periods", [10, 20, 50, 200]):
        results['sma'][f'sma_{period}'] = calculate_sma(close_prices, period).replace([np.inf, -np.inf], np.nan).fillna(
            method='bfill').fillna(method='ffill').tolist()

    # MACD
    results['macd'] = []
    for params in indicator_settings.get("macd_params", [{"fast": 12, "slow": 26, "signal": 9}]):
        macd_df = calculate_macd(close_prices, params["fast"], params["slow"], params["signal"])
        macd_data = {
            'params': f'{params["fast"]}_{params["slow"]}_{params["signal"]}',
            'macd_line': macd_df['MACD'].replace([np.inf, -np.inf], np.nan).fillna(method='bfill').fillna(
                method='ffill').tolist(),
            'signal_line': macd_df['Signal'].replace([np.inf, -np.inf], np.nan).fillna(method='bfill').fillna(
                method='ffill').tolist(),
            'histogram': macd_df['Histogram'].replace([np.inf, -np.inf], np.nan).fillna(method='bfill').fillna(
                method='ffill').tolist()
        }
        results['macd'].append(macd_data)

    # Bollinger Bands
    results['bollinger_bands'] = []
    for params in indicator_settings.get("bollinger_params", [{"period": 20, "std_dev": 2.0}]):
        bb_df = calculate_bollinger_bands(close_prices, params["period"], params["std_dev"])
        bb_data = {
            'params': f'{params["period"]}_{params["std_dev"]}',
            'middle_band': bb_df['Middle'].replace([np.inf, -np.inf], np.nan).fillna(method='bfill').fillna(
                method='ffill').tolist(),
            'upper_band': bb_df['Upper'].replace([np.inf, -np.inf], np.nan).fillna(method='bfill').fillna(
                method='ffill').tolist(),
            'lower_band': bb_df['Lower'].replace([np.inf, -np.inf], np.nan).fillna(method='bfill').fillna(
                method='ffill').tolist()
        }
        results['bollinger_bands'].append(bb_data)

    # ADX
    adx_period = indicator_settings.get("adx_period", 14)
    adx_df = calculate_adx(high_prices, low_prices, close_prices, adx_period)
    results['adx'] = {
        f'adx_{adx_period}': adx_df['ADX'].replace([np.inf, -np.inf], np.nan).fillna(method='bfill').fillna(
            method='ffill').tolist(),
        f'pdi_{adx_period}': adx_df['PDI'].replace([np.inf, -np.inf], np.nan).fillna(method='bfill').fillna(
            method='ffill').tolist(),
        f'mdi_{adx_period}': adx_df['MDI'].replace([np.inf, -np.inf], np.nan).fillna(method='bfill').fillna(
            method='ffill').tolist()
    }

    # Trend Detection (Example)
    # This is a simplified example; real trend detection can be more complex.
    # Uses SMA50 and SMA200
    sma50 = calculate_sma(close_prices, 50)
    sma200 = calculate_sma(close_prices, 200)

    trend = pd.Series("FLAT", index=close_prices.index)
    if not sma50.empty and not sma200.empty:
        trend[sma50 > sma200] = "UPTREND"
        trend[sma50 < sma200] = "DOWNTREND"

    # Take the latest trend value, or based on the last N periods
    latest_trend = trend.iloc[-1] if not trend.empty else "UNDETERMINED"
    results['trend_status'] = {
        'current_trend': latest_trend,
        'sma50_gt_sma200': (sma50.iloc[-1] > sma200.iloc[-1]) if not sma50.empty and not sma200.empty and len(
            sma50) > 0 and len(sma200) > 0 else None,
        'details': trend.fillna(method='bfill').fillna(method='ffill').tolist()  # Full series for frontend if needed
    }

    # Volatility Assessment (Example using ATR percentage)
    atr_period_volatility = indicator_settings.get("atr_period_for_volatility", 14)
    atr_for_volatility = calculate_atr(high_prices, low_prices, close_prices, atr_period_volatility)

    volatility_percentage = pd.Series(dtype=float)
    if not atr_for_volatility.empty and not close_prices.empty:
        # Ensure close_prices has values at corresponding atr_for_volatility indices
        valid_close_prices = close_prices[atr_for_volatility.index].replace(0, np.nan)  # Avoid division by zero
        volatility_percentage = (atr_for_volatility / valid_close_prices) * 100

    results['volatility'] = {
        'atr_percentage': volatility_percentage.replace([np.inf, -np.inf], np.nan).fillna(method='bfill').fillna(
            method='ffill').tolist(),
        'current_atr_percentage': volatility_percentage.iloc[-1] if not volatility_percentage.empty else None
    }

    # TODO: Implement logic for combining indicators to generate signals (BUY, SELL, HOLD)
    # This would typically involve defining rules based on multiple indicator values.
    # Example: RSI < 30 and MACD crossover upwards -> BUY
    # results['signals'] = generate_trading_signals(results)

    return results


def generate_trading_signals(indicator_data: dict, prices_df: pd.DataFrame) -> pd.Series:
    """
    Generates trading signals based on combined indicator data.
    This is a placeholder and needs to be implemented based on chosen strategies.
    Returns a Series with 'BUY', 'SELL', 'HOLD' signals aligned with timestamps.
    """
    num_points = len(indicator_data.get('timestamps', []))
    if num_points == 0:
        return pd.Series(dtype=str)

    signals = pd.Series(['HOLD'] * num_points, index=pd.to_datetime(indicator_data['timestamps'], unit='ms'))

    # Example Strategy: RSI Overbought/Oversold + MACD Confirmation
    # This is a very basic example and needs significant refinement and backtesting.
    try:
        # Assuming standard RSI(14) and MACD(12,26,9) are available
        rsi14 = pd.Series(indicator_data.get('rsi', {}).get('rsi_14', [np.nan] * num_points), index=signals.index)

        macd_12_26_9 = next((item for item in indicator_data.get('macd', []) if item['params'] == '12_26_9'), None)
        if macd_12_26_9:
            macd_line = pd.Series(macd_12_26_9.get('macd_line', [np.nan] * num_points), index=signals.index)
            signal_line = pd.Series(macd_12_26_9.get('signal_line', [np.nan] * num_points), index=signals.index)

            # Buy Signal: RSI < 30 (oversold) and MACD line crosses above Signal line
            buy_condition = (rsi14 < 30) & (macd_line > signal_line) & (macd_line.shift(1) < signal_line.shift(1))
            signals[buy_condition] = 'BUY'

            # Sell Signal: RSI > 70 (overbought) and MACD line crosses below Signal line
            sell_condition = (rsi14 > 70) & (macd_line < signal_line) & (macd_line.shift(1) > signal_line.shift(1))
            signals[sell_condition] = 'SELL'

    except Exception as e:
        print(f"Error generating example signals: {e}")  # Proper logging should be used
        # Fallback to all HOLD if there's an issue processing indicators
        return pd.Series(['HOLD'] * num_points, index=pd.to_datetime(indicator_data['timestamps'], unit='ms'))

    return signals.fillna('HOLD')
