from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.exceptions import AuthenticationFailed  # Corrected import
from django.contrib.auth import authenticate  # Keep this for CustomTokenObtainPairSerializer
from django.utils.translation import gettext_lazy as _
from rest_framework_simplejwt.tokens import RefreshToken

from .models import User


class RegisterSerializer(serializers.ModelSerializer):
    password2 = serializers.CharField(write_only=True, required=False, style={'input_type': 'password'})
    password = serializers.CharField(
        write_only=True,
        required=True,
        validators=[validate_password],
        style={'input_type': 'password'}
    )
    email = serializers.EmailField(required=True)  # Ensure email is explicitly required

    # access and refresh are added in to_representation or by view logic usually,
    # but can be declared as read_only if the serializer itself is expected to populate them.
    # For clarity, it's often better to handle token generation in the view or in `create`.
    access = serializers.CharField(read_only=True)
    refresh = serializers.CharField(read_only=True)

    class Meta:
        model = User
        # Ensure 'username' is not here if your model uses 'email' as USERNAME_FIELD and has no 'username' field
        fields = ('id', 'email', 'password', 'password2', "refresh", "access")  # Added 'id' for user object in response
        extra_kwargs = {
            'password': {'write_only': True},
            'email': {
                'error_messages': {
                    'unique': _("A user with this email already exists. Please log in or use a different email.")
                }
            }
        }

    def validate_email(self, value):
        # This validation might be redundant if email field on model is unique=True,
        # DRF handles unique checks automatically. However, it's fine for explicit error.
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError(_("User with this email already exists."))
        return value

    def validate(self, attrs):
        password = attrs.get("password")
        password2 = attrs.pop("password2", None)  # Pop password2 as it's not part of the User model

        if password2 is not None and password != password2:
            raise serializers.ValidationError({
                'password2': _("Passwords do not match.")
            })
        return attrs

    def create(self, validated_data):
        # 'password2' should have been popped in validate or not passed to create_user
        user = User.objects.create_user(
            email=validated_data['email'],
            password=validated_data['password']
            # Add other fields from validated_data if User.objects.create_user expects them
            # or if they are part of your User model and should be set on creation.
        )
        return user

    # If RegisterSerializer is used directly in a view that expects tokens in the response,
    # you might add them here, or (better) have the view add them after calling serializer.save()
    def to_representation(self, instance):
        representation = super().to_representation(instance)
        refresh = RefreshToken.for_user(instance)
        representation['refresh_token'] = str(refresh)
        representation['access_token'] = str(refresh.access_token)
        representation.pop('password', None) # Ensure password is not sent back
        return representation


# Renamed UserProfileSerializer to UserSerializer
class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = (
            "id",  # Good practice to include ID
            "email",
            "balance",
            "leverage",
            "risk_percentage",
            # "binance_api_key", # BE VERY CAREFUL ABOUT EXPOSING API KEYS
            # "binance_secret_key",# BE VERY CAREFUL ABOUT EXPOSING API KEYS
            "trade_mode",
            "date_joined",
            "is_active",  # Useful to know user status
            "is_staff"  # Useful for frontend conditional rendering if needed
        )
        # Fields that should not be directly updatable through this generic serializer by default
        # or are for display only.
        read_only_fields = ("id", "email", "date_joined", "balance", "is_active", "is_staff")

        # To hide API keys from general user representation but allow them to be updated via UserProfileView:
        # You might create specific serializers or use different field sets in different views.
        # For now, I've commented them out from general exposure for safety.
        # If UserProfileView needs to update them, it can specify write_only fields or a different serializer.


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    default_error_messages = {
        "no_active_account": _("No active account found with the given credentials."),
        "user_not_found": _("User with this email does not exist."),  # Custom message
        "incorrect_password": _("Incorrect password provided for this email.")  # Custom message
    }

    # Override to use 'email' as the username field for JWT
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        # Add custom claims if needed
        # token['email'] = user.email
        return token

    def validate(self, attrs):
        # The `authenticate` utility in Django expects `username` by default.
        # Since our USERNAME_FIELD is 'email', we pass `email` as `username` to `authenticate`.
        # Or, ensure your custom backend handles `email` directly.
        # The default TokenObtainPairSerializer uses self.user = authenticate(...)

        # The original code had custom logic to fetch User by email first.
        # It's generally better to rely on Django's authenticate if possible,
        # configuring it or the authentication backend if needed.
        # For this CustomTokenObtainPairSerializer, the goal is to authenticate and issue tokens.

        # Let's try to use Django's authenticate, assuming the request can be passed
        # or that the auth backend is configured for email.

        # `attrs` will contain `email` (as username_field) and `password`.
        # We need to ensure `authenticate` is called correctly.
        # The parent class `TokenObtainPairSerializer` already calls authenticate.
        # The main change needed is to ensure it uses 'email' as the username field.
        # This is typically handled by setting USERNAME_FIELD on the custom User model.

        # If attrs comes with 'email' and 'password' from the form:
        email_attr_name = self.username_field  # usually 'email' if ModelBackend is used with USERNAME_FIELD = 'email'

        # Pass the email to the parent's validation logic by ensuring it's under the expected username_field
        data = {}
        try:
            # This call to super().validate will internally call authenticate
            # with username=attrs[self.username_field] and password=attrs['password']
            data = super().validate(attrs)
        except AuthenticationFailed as e:
            # Customize error messages based on the exception code or type if needed
            # The parent class already raises AuthenticationFailed with "no_active_account"
            # We can re-raise with more specific messages if we can determine the cause

            # Check if user exists to give a more specific error
            user_exists = User.objects.filter(**{self.username_field: attrs.get(self.username_field)}).exists()
            if not user_exists:
                raise AuthenticationFailed(
                    self.error_messages["user_not_found"],
                    code="user_not_found"
                )
            # If user exists but password was wrong or inactive, parent's "no_active_account" is okay
            # or you can raise your "incorrect_password" if you verify password separately before super().validate
            raise e  # Re-raise the original exception if not providing a more specific one

        # Add user data to the response along with tokens
        user_serializer = UserSerializer(self.user)  # self.user is set by super().validate()
        data['user'] = user_serializer.data
        return data