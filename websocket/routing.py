# websocket/routing.py
from django.urls import re_path
from . import consumers

websocket_urlpatterns = [
    # URL for kline data, e.g., ws://localhost:8000/ws/klines/BTCUSDT_1m/
    re_path(r'ws/marketdata/$', consumers.MarketDataConsumer.as_asgi()),
]