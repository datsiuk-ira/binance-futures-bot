from django.urls import path
from .views import RegisterView, UserProfileView, CustomTokenObtainPairView # Updated import
from rest_framework_simplejwt.views import TokenRefreshView

app_name = 'users'

urlpatterns = [
    path("register/", RegisterView.as_view(), name="register"),
    path("login/", CustomTokenObtainPairView.as_view(), name="login"), # Use custom view
    path("refresh/", TokenRefreshView.as_view(), name="refresh"),
    path("profile/", UserProfileView.as_view(), name="profile"),
]