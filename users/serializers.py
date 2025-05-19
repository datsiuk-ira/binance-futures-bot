from rest_framework import serializers
from .models import User
from django.contrib.auth.password_validation import validate_password

class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, validators=[validate_password])

    class Meta:
        model = User
        fields = ("email", "password")

    def create(self, validated_data):
        user = User.objects.create_user(
            email=validated_data["email"],
            password=validated_data["password"]
        )
        return user

class UserProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = (
            "email",
            "balance",
            "leverage",
            "risk_percentage",
            "binance_api_key", # Подумайте про безпеку передачі ключів
            "binance_secret_key", # Подумайте про безпеку передачі ключів
            "trade_mode",
            "date_joined",
        )
        read_only_fields = ("email", "date_joined", "balance") # Баланс, можливо, має оновлюватися іншим шляхом