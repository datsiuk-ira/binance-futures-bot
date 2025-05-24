# root/arima/urls.py
from django.urls import path
from .views import ArimaForecastView

urlpatterns = [
    path('forecast/', ArimaForecastView.as_view(), name='arima_forecast'),
]