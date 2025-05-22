# users/urls.py
from django.urls import path
from .views import RegisterView, LoginView, LogoutView, UserProfileView, get_csrf_token
from rest_framework_simplejwt.views import (
    TokenRefreshView,
    TokenVerifyView,
)

urlpatterns = [
    path('register/', RegisterView.as_view(), name='auth_register'),
    path('login/', LoginView.as_view(), name='auth_login'),       # Matches login/
    path('logout/', LogoutView.as_view(), name='auth_logout'),
    path('profile/', UserProfileView.as_view(), name='user_profile'),
    path('token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('token/verify/', TokenVerifyView.as_view(), name='token_verify'),
    path('csrf/', get_csrf_token, name='get_csrf_token'),         # Matches csrf/
]