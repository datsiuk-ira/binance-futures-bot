# indicators/urls.py
from django.urls import path
from .views import HistoricalIndicatorsView

urlpatterns = [
    path('historical/', HistoricalIndicatorsView.as_view(), name='historical_indicators'),
]
