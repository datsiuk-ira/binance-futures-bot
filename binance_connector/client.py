# binance_connector/client.py

from binance.client import Client as BinanceAPISyncClient # Перейменовано для уникнення конфліктів
from django.conf import settings
import logging

logger = logging.getLogger(__name__)

def get_binance_futures_client():
    """
    Ініціалізує та повертає синхронний клієнт Binance Futures.
    """
    api_key = settings.BINANCE_API_KEY
    api_secret = settings.BINANCE_SECRET_KEY

    if not api_key or not api_secret:
        logger.error("Binance API Key or Secret Key is not configured.")
        return None

    try:
        # Для python-binance, testnet=True налаштовує базові URL для тестової мережі
        # Для ф'ючерсів, бібліотека повинна автоматично використовувати відповідні ендпоінти,
        # але ми можемо явно вказати URL, якщо потрібно, хоча testnet=True зазвичай достатньо.
        client = BinanceAPISyncClient(api_key, api_secret, testnet=settings.USE_BINANCE_TESTNET)

        # Перевірка з'єднання (пінг до сервера)
        client.ping()
        server_time = client.get_server_time()
        logger.info(f"Successfully connected to Binance API. Testnet: {settings.USE_BINANCE_TESTNET}. Server time: {server_time}")
        return client
    except Exception as e:
        logger.error(f"Error connecting to Binance API: {e}", exc_info=True)
        return None

def get_futures_klines(symbol='BTCUSDT', interval=BinanceAPISyncClient.KLINE_INTERVAL_1MINUTE, limit=20):
    """
    Отримує історичні дані (klines) для ф'ючерсної пари.
    """
    client = get_binance_futures_client()
    if not client:
        return {"error": "Failed to initialize Binance client"}

    try:
        # Запит klines для ф'ючерсів
        # client.futures_klines OR client.get_klines (перевірте документацію бібліотеки для futures)
        # Для python-binance, це client.futures_klines
        klines = client.futures_klines(symbol=symbol, interval=interval, limit=limit)

        processed_klines = []
        for k in klines:
            processed_klines.append({
                "open_time": k[0],
                "open": k[1],
                "high": k[2],
                "low": k[3],
                "close": k[4],
                "volume": k[5],
                "close_time": k[6],
                "quote_asset_volume": k[7],
                "number_of_trades": k[8],
                "taker_buy_base_asset_volume": k[9],
                "taker_buy_quote_asset_volume": k[10],
                "ignore": k[11],
                "symbol": symbol, # Додаємо для контексту
                "interval": interval # Додаємо для контексту
            })
        return processed_klines
    except Exception as e:
        logger.error(f"Error fetching futures klines for {symbol} ({interval}): {e}", exc_info=True)
        return {"error": str(e)}