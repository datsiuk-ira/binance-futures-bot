# celery_tasks/tasks.py
from datetime import datetime

import pandas as pd
from celery import shared_task
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
import time
import logging

from binance_connector.client import get_futures_klines
from indicators.technical_indicators import get_all_indicators
logger = logging.getLogger(__name__)

@shared_task(name="fetch_and_send_market_data")
def fetch_and_send_market_data_task(pair_symbol, interval, limit=20):
    logger.info(f"Task started: Fetching market data for {pair_symbol} interval {interval}")
    try:
        raw_klines_result = get_futures_klines(
            symbol=pair_symbol.upper(),
            interval=interval,
            limit=limit
        )

        if isinstance(raw_klines_result, dict) and "error" in raw_klines_result:
            logger.error(f"Error fetching klines for {pair_symbol}: {raw_klines_result['error']}")
            return

        klines_for_indicators = []
        for k_data in raw_klines_result:
            try:
                klines_for_indicators.append({
                    "timestamp": int(k_data["open_time"] / 1000),
                    "open": float(k_data["open"]),
                    "high": float(k_data["high"]),
                    "low": float(k_data["low"]),
                    "close": float(k_data["close"]),
                    "volume": float(k_data["volume"]),
                })
            except (IndexError, ValueError) as e:
                logger.error(f"Error processing kline data point for {pair_symbol}: {k_data} - {e}")
                continue

        if not klines_for_indicators:
            logger.warning(f"No klines processed for {pair_symbol} {interval} after formatting.")
            message_payload = {"klines": [], "indicators": None}
        else:
            indicators_data = get_all_indicators(pd.DataFrame(klines_for_indicators))
            message_payload = {
                "klines": klines_for_indicators,
                "indicators": indicators_data
            }

        channel_layer = get_channel_layer()
        room_group_name = f'market_data_{pair_symbol.lower()}'

        async_to_sync(channel_layer.group_send)(
            room_group_name,
            {
                'type': 'market_data_update',
                'message_payload': message_payload,
                'interval': interval
            }
        )
        logger.info(f"Market data sent for {pair_symbol} interval {interval} to group {room_group_name}")

    except Exception as e:
        logger.error(f"Error in fetch_and_send_market_data_task for {pair_symbol} {interval}: {e}", exc_info=True)