from django.contrib.auth import authenticate
from django.http import JsonResponse
from django.views.decorators.csrf import ensure_csrf_cookie, \
    csrf_exempt  # Removed unused login, logout from django.contrib.auth
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from .serializers import UserSerializer, RegisterSerializer  # UserSerializer will now be found
from .models import User  # Changed from CustomUser to User
import json


class RegisterView(generics.CreateAPIView):
    queryset = User.objects.all()
    permission_classes = (permissions.AllowAny,)
    serializer_class = RegisterSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user_instance = serializer.save()

        user_data_serializer = UserSerializer(user_instance, context=self.get_serializer_context())

        # Generate tokens for the newly registered user
        refresh = RefreshToken.for_user(user_instance)

        return Response({
            "user": user_data_serializer.data,
            "access_token": str(refresh.access_token),
            "refresh_token": str(refresh),
            "message": "User registered successfully. Please log in."
        }, status=status.HTTP_201_CREATED)


class LoginView(APIView):
    permission_classes = (permissions.AllowAny,)

    @csrf_exempt
    def post(self, request, *args, **kwargs):
        # If using email as username field, adjust accordingly or use a custom serializer
        # Assuming username for login can be the email as per your User model USERNAME_FIELD = "email"
        identifier = request.data.get('username') or request.data.get('email')  # Allow login with username or email
        password = request.data.get('password')

        if not identifier or not password:
            return Response({'error': 'Email (or username) and password are required.'},
                            status=status.HTTP_400_BAD_REQUEST)

        # Authenticate using email as the username field
        user = authenticate(request, email=identifier, password=password)

        if user is not None:
            refresh = RefreshToken.for_user(user)
            user_serializer = UserSerializer(user)  # This will use the renamed UserSerializer
            return Response({
                'access_token': str(refresh.access_token),
                'refresh_token': str(refresh),
                'user': user_serializer.data,
                'message': 'Login successful.'
            }, status=status.HTTP_200_OK)
        else:
            return Response({'error': 'Invalid credentials. Please try again.'}, status=status.HTTP_401_UNAUTHORIZED)


class LogoutView(APIView):
    permission_classes = (permissions.IsAuthenticated,)

    def post(self, request):
        try:
            # Example: If you want to blacklist refresh tokens (requires additional setup)
            # refresh_token = request.data.get("refresh_token")
            # if refresh_token:
            #     token = RefreshToken(refresh_token)
            #     token.blacklist()
            return Response({"message": "Successfully logged out."}, status=status.HTTP_200_OK)
        except Exception as e:
            # Log the exception e for debugging
            return Response({"error": "Logout failed."}, status=status.HTTP_400_BAD_REQUEST)


class UserProfileView(generics.RetrieveUpdateAPIView):  # Changed to RetrieveUpdateAPIView for profile updates
    permission_classes = (permissions.IsAuthenticated,)
    serializer_class = UserSerializer  # This will use the renamed UserSerializer

    def get_object(self):
        return self.request.user

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = self.get_serializer(instance)
        return Response({'user': serializer.data}, status=status.HTTP_200_OK)

    # Example update method (partial_update for PATCH)
    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return Response(serializer.data)


@ensure_csrf_cookie
def get_csrf_token(request):
    return JsonResponse({'detail': 'CSRF cookie set'})