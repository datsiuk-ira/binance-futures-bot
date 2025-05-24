# api/urls.py
from django.urls import path, include

from indicators.views import RiskCalculationView, SignalAnalysisView
from .views import MarketDataKlinesView # Ваш View

app_name = 'api'

urlpatterns = [
    path('market-data/klines/', MarketDataKlinesView.as_view(), {'symbol': 'BTCUSDT'}, name='market_klines_default'),
    path('market-data/klines/<str:symbol>/', MarketDataKlinesView.as_view(), name='market_klines_symbol'),
    path('indicators/', include('indicators.urls')),

    path('risk/calculate/', RiskCalculationView.as_view(), name='calculate_risk'),
    path('signals/analyze/', SignalAnalysisView.as_view(), name='analyze_signal'),
]