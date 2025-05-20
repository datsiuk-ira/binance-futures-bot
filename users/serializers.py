from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.exceptions import AuthenticationFailed
from django.contrib.auth import authenticate
from django.utils.translation import gettext_lazy as _
from rest_framework_simplejwt.tokens import RefreshToken

from .models import User


class RegisterSerializer(serializers.ModelSerializer):
    password2 = serializers.CharField(write_only=True, required=False)
    password = serializers.CharField(
        write_only=True,
        required=True,
        validators=[validate_password],
        style={'input_type': 'password'}
    )
    # Add fields to return tokens
    access = serializers.CharField(read_only=True)
    refresh = serializers.CharField(read_only=True)

    class Meta:
        model = User
        fields = ('email', 'password', 'password2', 'access', 'refresh')
        extra_kwargs = {
            'password': {'write_only': True},
            'email': {
                'error_messages': {
                    'unique': _("A user with this email already exists. Please log in or use a different email.")
                }
            }
        }

    def to_representation(self, instance):
        # This method is called when serializer.data is accessed
        representation = super().to_representation(instance)
        refresh = RefreshToken.for_user(instance)
        representation['refresh'] = str(refresh)
        representation['access'] = str(refresh.access_token)
        # We don't want to send the password back
        representation.pop('password', None)
        return representation

    def validate_email(self, value):
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError(_("User with this email already exists."))
        return value

    def validate(self, attrs):
        password = attrs.get("password")
        password2 = attrs.get("password2")

        # Якщо пароль2 передано — обов'язково перевіряємо на відповідність
        if password2 is not None and password != password2:
            raise serializers.ValidationError({
                'password2': _("Passwords do not match.")
            })

        return attrs

    def create(self, validated_data):
        validated_data.pop("password2", None)
        user = User.objects.create_user(**validated_data)

        # Generate tokens for the new user
        refresh = RefreshToken.for_user(user)
        validated_data['refresh'] = str(refresh)
        validated_data['access'] = str(refresh.access_token)
        self.instance = user

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


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    default_error_messages = {
        "no_active_account": _("No active account found with the given credentials."),
        "user_not_found": _("User with this email does not exist."),
        "incorrect_password": _("Incorrect password provided for this email.")
    }

    def validate(self, attrs):
        email = attrs.get(self.username_field)
        password = attrs.get("password")

        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            raise AuthenticationFailed(
                self.error_messages["user_not_found"],
                code="user_not_found"
            )

        if not user.check_password(password):
            raise AuthenticationFailed(
                self.error_messages["incorrect_password"],
                code="incorrect_password"
            )

        if not user.is_active:
            raise AuthenticationFailed(
                self.error_messages["no_active_account"],
                code="no_active_account"
            )

        # Все гаразд, викликаємо стандартну валідацію JWT
        self.user = authenticate(
            request=self.context.get("request"), **{self.username_field: email, "password": password}
        )

        if not self.user:
            raise AuthenticationFailed(
                self.error_messages["no_active_account"],
                code="no_active_account"
            )

        return super().validate(attrs)
