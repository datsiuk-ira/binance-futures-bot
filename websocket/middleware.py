from channels.db import database_sync_to_async
from rest_framework_simplejwt.tokens import AccessToken
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from urllib.parse import parse_qs


# Django model imports are deferred

@database_sync_to_async
def get_user_from_token(token_key):
    # Import Django model-related items here, inside the async function
    from django.contrib.auth import get_user_model
    from django.contrib.auth.models import AnonymousUser
    User = get_user_model()

    try:
        if not token_key:
            return AnonymousUser()
        token = AccessToken(token_key)
        user_id = token.payload.get('user_id')
        if user_id is None:
            return AnonymousUser()
        return User.objects.get(id=user_id)
    except (InvalidToken, TokenError, User.DoesNotExist):
        return AnonymousUser()
    except Exception:  # Catch any other unexpected errors
        # Log the exception here if you have logging setup
        return AnonymousUser()


class TokenAuthMiddleware:
    """
    Custom middleware for Django Channels to authenticate users using a JWT token
    passed in the query string.
    """

    def __init__(self, inner):
        self.inner = inner

    async def __call__(self, scope, receive, send):
        from django.contrib.auth.models import AnonymousUser  # Import here for default user

        query_string = scope.get('query_string', b'').decode()
        query_params = parse_qs(query_string)
        token = query_params.get('token', [None])[0]  # Get the token

        if token:
            scope['user'] = await get_user_from_token(token)
        else:
            scope['user'] = AnonymousUser()

        # Debugging: print the user found in scope
        # print(f"TokenAuthMiddleware: User in scope: {scope['user']}")

        return await self.inner(scope, receive, send)