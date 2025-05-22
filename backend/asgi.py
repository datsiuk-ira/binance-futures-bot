import os
import django # Ensure django is imported
from django.core.asgi import get_asgi_application

# Set the DJANGO_SETTINGS_MODULE environment variable.
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')

# Initialize Django settings and applications. This MUST be called before importing
# any Django models or modules that depend on the app registry.
django.setup()

# Now that Django is initialized, import Channels and other Django-dependent modules.
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.auth import AuthMiddlewareStack # Generally safe after django.setup()

# Import your custom middleware and routing AFTER django.setup()
from websocket.middleware import TokenAuthMiddleware # As per your traceback
import websocket.routing

application = ProtocolTypeRouter({
    "http": get_asgi_application(),
    "websocket": TokenAuthMiddleware( # Your custom middleware
        AuthMiddlewareStack(         # Standard Channels auth middleware
            URLRouter(
                websocket.routing.websocket_urlpatterns
            )
        )
    ),
})