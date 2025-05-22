from django.urls import re_path
from . import consumers

websocket_urlpatterns = [
    re_path(r'ws/market-data/(?P<pair_symbol>\w+)/$', consumers.MarketDataConsumer.as_asgi()),
    # Example: re_path(r'ws/trade-updates/$', consumers.TradeUpdatesConsumer.as_asgi()),
]