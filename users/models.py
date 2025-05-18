from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin, BaseUserManager
from django.db import models


class UserManager(BaseUserManager):
    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError("Email is required")
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save()
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        return self.create_user(email, password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin):
    email = models.EmailField(unique=True)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)

    # Торгові налаштування
    balance = models.DecimalField(max_digits=20, decimal_places=8, default=0)
    leverage = models.IntegerField(default=1)
    risk_percentage = models.FloatField(default=1.0)

    # Binance API
    binance_api_key = models.CharField(max_length=128, blank=True)
    binance_secret_key = models.CharField(max_length=128, blank=True)

    # Режим (auto / semi / analytics)
    trade_mode = models.CharField(
        max_length=10,
        choices=[
            ("auto", "Auto"),
            ("semi", "Semi-Auto"),
            ("analytics", "Analytics")
        ],
        default="analytics"
    )

    date_joined = models.DateTimeField(auto_now_add=True)

    objects = UserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []

    def __str__(self):
        return self.email
