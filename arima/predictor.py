# root/arima/predictor.py
import traceback
import itertools
import warnings

import pandas as pd
import numpy as np
from statsmodels.tsa.statespace.sarimax import SARIMAX
# from statsmodels.tsa.stattools import adfuller # Not currently used in active optimization path
import logging

from statsmodels.tsa.stattools import adfuller

logger = logging.getLogger(__name__)

DEFAULT_ARIMA_ORDER = (5, 1, 0)
DEFAULT_SEASONAL_ORDER = (0, 0, 0, 0)
FORECAST_STEPS = 10


# get_stationarity function can be kept if you plan to use it for 'd' or 'D' determination later
# For now, it's not directly called by the simplified find_best_arima_order
def get_stationarity(series: pd.Series, significance_level=0.05):
    if series.empty:
        return True
    try:
        adf_result = adfuller(series.dropna(), autolag='AIC')
        p_value = adf_result[1]
        return p_value <= significance_level
    except Exception as e:
        logger.warning(f"ARIMA: Stationarity check failed: {e}")
        return False


def find_best_arima_order(series: pd.Series,
                          p_iterable=range(0, 4),
                          d_iterable=range(0, 2),
                          q_iterable=range(0, 2),
                          seasonal_P_iterable=range(0, 1),
                          seasonal_D_iterable=range(0, 1),
                          seasonal_Q_iterable=range(0, 1),
                          m=1,
                          seasonal=False,
                          enforce_pdq_limits=True):
    best_aic = np.inf
    best_order = DEFAULT_ARIMA_ORDER
    best_seasonal_order_params = (0, 0, 0)

    series_for_fit = series.dropna()
    if len(series_for_fit) < 20:
        logger.warning("ARIMA: Insufficient data for order optimization. Using default order.")
        return best_order, (*DEFAULT_SEASONAL_ORDER[:3], m if seasonal else 0)

    logger.info(f"ARIMA: Starting manual search for best ARIMA order. Series length: {len(series_for_fit)}")

    non_seasonal_orders = list(itertools.product(p_iterable, d_iterable, q_iterable))

    if seasonal:
        current_seasonal_orders_pdq = list(
            itertools.product(seasonal_P_iterable, seasonal_D_iterable, seasonal_Q_iterable))
    else:
        current_seasonal_orders_pdq = [(0, 0, 0)]

    total_fits = len(non_seasonal_orders) * len(current_seasonal_orders_pdq)
    if total_fits == 0:
        logger.warning("ARIMA: No parameter combinations to check. Using default order.")
        return DEFAULT_ARIMA_ORDER, (*DEFAULT_SEASONAL_ORDER[:3], m if seasonal else 0)

    logger.info(f"ARIMA: Total model combinations to fit: {total_fits}")
    fit_count = 0

    warnings.filterwarnings("ignore")

    for order_pdq in non_seasonal_orders:
        for seasonal_pdq_part in current_seasonal_orders_pdq:
            fit_count += 1
            if fit_count % 10 == 0 or fit_count == total_fits or total_fits < 10:
                logger.info(
                    f"ARIMA: Fitting model {fit_count}/{total_fits} (Order: {order_pdq}, Seasonal_PDQ: {seasonal_pdq_part}, m: {m if seasonal else 0})")

            current_s_order_full = (*seasonal_pdq_part, m) if seasonal else (0, 0, 0, 0)

            try:
                model = SARIMAX(series_for_fit,
                                order=order_pdq,
                                seasonal_order=current_s_order_full,
                                enforce_stationarity=False,
                                enforce_invertibility=False,
                                initialization='approximate_diffuse')
                results = model.fit(disp=False)
                if results.aic < best_aic:
                    best_aic = results.aic
                    best_order = order_pdq
                    best_seasonal_order_params = seasonal_pdq_part
                    logger.info(
                        f"ARIMA: New best model found - AIC: {best_aic:.2f}, Order: {best_order}, Seasonal_PDQ: {best_seasonal_order_params}, m: {m if seasonal else 0}")
            except Exception:
                continue

    warnings.filterwarnings("default")

    final_best_seasonal_order = (*best_seasonal_order_params,
                                 m if seasonal and m > 1 else 0)

    if best_aic == np.inf:
        logger.warning("ARIMA: No suitable model found during optimization. Using default order.")
        return DEFAULT_ARIMA_ORDER, (*DEFAULT_SEASONAL_ORDER[:3],
                                     m if seasonal and m > 1 else 0)

    logger.info(
        f"ARIMA: Best model optimization complete. Final Order: {best_order}, Seasonal Order: {final_best_seasonal_order}, AIC: {best_aic:.2f}")
    return best_order, final_best_seasonal_order


def optimize_arima_order(series: pd.Series,
                         start_p=0, max_p=3,
                         start_q=0, max_q=2,
                         d_range=(0, 2),
                         start_P=0, max_P=1,
                         start_Q=0, max_Q=1,
                         D_range=(0, 1),
                         m=1,
                         seasonal=False,
                         trace=False,
                         error_action='ignore', suppress_warnings=True,
                         stepwise=True):

    if series.empty or len(series) < 20:
        logger.warning(
            "ARIMA: Insufficient data for optimization process. Default values will be used.")
        return DEFAULT_ARIMA_ORDER, (*DEFAULT_SEASONAL_ORDER[:3], m if seasonal else 0)

    p_iterable = range(start_p, max_p + 1)
    d_iterable = d_range
    q_iterable = range(start_q, max_q + 1)

    P_iterable, D_iterable, Q_iterable_seasonal = [0], [0], [0]

    if seasonal:
        P_iterable = range(start_P, max_P + 1)
        D_iterable = D_range
        Q_iterable_seasonal = range(start_Q, max_Q + 1)
    else:
        m_to_pass = 0

    best_order, best_seasonal_order_full = find_best_arima_order(
        series,
        p_iterable=p_iterable,
        d_iterable=d_iterable,
        q_iterable=q_iterable,
        seasonal_P_iterable=P_iterable,
        seasonal_D_iterable=D_iterable,
        seasonal_Q_iterable=Q_iterable_seasonal,
        m=m_to_pass if not seasonal else m,
        seasonal=seasonal
    )

    return best_order, best_seasonal_order_full


def get_arima_forecast(series: pd.Series, order: tuple = None, seasonal_order: tuple = None,
                       steps: int = FORECAST_STEPS):
    if series.empty:
        logger.warning("ARIMA: Input series is empty. Cannot forecast.")
        empty_idx = pd.RangeIndex(start=0, stop=steps)
        return pd.Series([np.nan] * steps, index=empty_idx, dtype=float), \
            pd.DataFrame({'lower': [np.nan] * steps, 'upper': [np.nan] * steps}, index=empty_idx, dtype=float)

    final_order = order if order is not None else DEFAULT_ARIMA_ORDER

    if seasonal_order is not None and isinstance(seasonal_order, tuple) and len(seasonal_order) == 4:
        p_s, d_s, q_s, m_s = seasonal_order
        if m_s <= 1:
            logger.info(f"ARIMA: seasonal_order {seasonal_order} has m <= 1. Treating as non-seasonal.")
            final_seasonal_order = (0, 0, 0, 0)
        else:
            final_seasonal_order = seasonal_order
    else:
        if seasonal_order is not None:
            logger.warning(f"ARIMA: Invalid or incomplete seasonal_order {seasonal_order}. Treating as non-seasonal.")
        final_seasonal_order = (0, 0, 0, 0)

    logger.info(
        f"ARIMA: Training model with order={final_order}, seasonal_order={final_seasonal_order} on {len(series)} data points.")

    series_for_fit = series.copy()

    try:
        if not isinstance(series_for_fit.index, pd.DatetimeIndex):
            try:
                if pd.api.types.is_integer_dtype(series_for_fit.index):
                    series_for_fit.index = pd.to_datetime(series_for_fit.index, unit='ms', errors='coerce')
                elif isinstance(series_for_fit.index, pd.PeriodIndex):
                    series_for_fit.index = series_for_fit.index.to_timestamp()

                if series_for_fit.index.isna().any():
                    logger.warning(
                        "ARIMA: Index conversion to DatetimeIndex resulted in NaT values. Falling back to RangeIndex.")
                    series_for_fit.index = pd.RangeIndex(len(series_for_fit))
                else:
                    logger.info("ARIMA: Successfully converted series index to DatetimeIndex.")
            except Exception as e_conv:
                logger.warning(
                    f"ARIMA: Could not convert series index to DatetimeIndex (error: {e_conv}). Using RangeIndex.")
                series_for_fit.index = pd.RangeIndex(len(series_for_fit))

        model = SARIMAX(series_for_fit,
                        order=final_order,
                        seasonal_order=final_seasonal_order,
                        enforce_stationarity=False,
                        enforce_invertibility=False,
                        initialization='approximate_diffuse')

        results = model.fit(disp=False)

        forecast_obj = results.get_forecast(steps=steps)
        forecast_values = forecast_obj.predicted_mean
        confidence_intervals = forecast_obj.conf_int()

        if isinstance(series_for_fit.index, pd.DatetimeIndex) and not series_for_fit.empty:
            last_dt_timestamp = series_for_fit.index[-1]
            freq = pd.infer_freq(series_for_fit.index)
            if freq:
                future_index = pd.date_range(start=last_dt_timestamp, periods=steps + 1, freq=freq)[1:]
                logger.info(f"ARIMA: Generated future DatetimeIndex with inferred frequency '{freq}'.")
            elif len(series_for_fit.index) >= 2:
                assumed_interval_duration = series_for_fit.index[-1] - series_for_fit.index[-2]
                if assumed_interval_duration.total_seconds() > 0:
                    future_index = pd.date_range(start=last_dt_timestamp + assumed_interval_duration, periods=steps,
                                                 freq=assumed_interval_duration)
                    logger.info(f"ARIMA: Inferred interval for future DatetimeIndex: {assumed_interval_duration}.")
                else:
                    future_index = pd.RangeIndex(start=len(series_for_fit), stop=len(series_for_fit) + steps)
                    logger.warning("ARIMA: Using numeric RangeIndex (interval was zero/negative).")
            else:
                future_index = pd.RangeIndex(start=len(series_for_fit), stop=len(series_for_fit) + steps)
                logger.warning(
                    "ARIMA: Using numeric RangeIndex (could not infer DatetimeIndex frequency/interval for forecast).")

            forecast_values.index = future_index
            confidence_intervals.index = future_index
        else:
            forecast_values.index = pd.RangeIndex(start=len(series_for_fit), stop=len(series_for_fit) + steps)
            confidence_intervals.index = pd.RangeIndex(start=len(series_for_fit), stop=len(series_for_fit) + steps)
            logger.info(
                "ARIMA: Using numeric RangeIndex for forecast (original index not Datetime or conversion failed).")

        logger.info(f"ARIMA: Forecast created successfully for {steps} steps.")
        return forecast_values, confidence_intervals

    except ValueError as ve:
        logger.error(f"ARIMA: ValueError during model training or forecasting: {ve}\n{traceback.format_exc()}")
        logger.error(
            f"ARIMA: Parameters at error - final_order: {final_order}, final_seasonal_order: {final_seasonal_order}")
        empty_forecast_index = pd.RangeIndex(start=len(series), stop=len(series) + steps)
        return pd.Series([np.nan] * steps, index=empty_forecast_index, dtype=float), \
            pd.DataFrame({'lower': [np.nan] * steps, 'upper': [np.nan] * steps}, index=empty_forecast_index,
                         dtype=float)
    except Exception as e:
        logger.error(f"ARIMA: Error during model training or forecasting: {e}\n{traceback.format_exc()}")
        empty_forecast_index = pd.RangeIndex(start=len(series), stop=len(series) + steps)
        return pd.Series([np.nan] * steps, index=empty_forecast_index, dtype=float), \
            pd.DataFrame({'lower': [np.nan] * steps, 'upper': [np.nan] * steps}, index=empty_forecast_index,
                         dtype=float)
