import json
import asyncio
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
# from binance_connector.client import BinanceClient # If needed for fetching initial data
# from django.conf import settings # If using API keys directly here

class MarketDataConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.pair_symbol = self.scope['url_route']['kwargs']['pair_symbol'].lower()
        self.room_group_name = f'market_data_{self.pair_symbol}'

        # Check if user is authenticated (if your WebSockets require authentication)
        # user = self.scope.get('user', None)
        # if user is None or not user.is_authenticated:
        #     await self.close()
        #     return

        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name
        )
        await self.accept()
        await self.send(text_data=json.dumps({
            'type': 'connection_established',
            'message': f'Connected to market data for {self.pair_symbol.upper()}'
        }))
        # Example: Start a task to stream data if this consumer is responsible for it
        # asyncio.create_task(self.stream_binance_data())


    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(
            self.room_group_name,
            self.channel_name
        )
        print(f"WebSocket disconnected for {self.pair_symbol} with code: {close_code}")


    async def receive(self, text_data=None, bytes_data=None):
        """
        Handles messages received from the WebSocket client.
        """
        try:
            if text_data:
                text_data_json = json.loads(text_data)
                message_type = text_data_json.get('type')
                payload = text_data_json.get('payload')

                if message_type == 'subscribe_kline':
                    # Example: Client wants to subscribe to kline updates for a specific interval
                    interval = payload.get('interval', '1m') # Default to 1 minute
                    # Logic to handle kline subscription, potentially start a new stream or adjust existing
                    await self.send(text_data=json.dumps({
                        'type': 'subscription_ack',
                        'message': f'Subscribed to klines for {self.pair_symbol.upper()} interval {interval}'
                    }))
                elif message_type == 'ping':
                    await self.send(text_data=json.dumps({'type': 'pong'}))
                else:
                    # Generic message handling or echo
                    print(f"Received unknown message type from client: {text_data_json}")
                    await self.send(text_data=json.dumps({
                        'type': 'echo',
                        'message': text_data_json
                    }))
            else:
                 print("Received non-text data, ignoring.")

        except json.JSONDecodeError:
            print("Received invalid JSON from client.")
            await self.send(text_data=json.dumps({
                'type': 'error',
                'message': 'Invalid JSON format.'
            }))
        except Exception as e:
            print(f"Error processing message from client: {e}")
            await self.send(text_data=json.dumps({
                'type': 'error',
                'message': f'An error occurred: {str(e)}'
            }))


    async def market_data_update(self, event):
        """
        Handles messages sent from the backend (e.g., Celery task) to the group.
        This method name should match the 'type' in channel_layer.group_send()
        """
        message = event['message'] # The actual data payload

        await self.send(text_data=json.dumps({
            'type': 'market_update', # Or kline_update, trade_update etc.
            'pair': self.pair_symbol.upper(),
            'data': message
        }))

    # Example of how a Celery task might send data to this consumer group:
    # from channels.layers import get_channel_layer
    # from asgiref.sync import async_to_sync
    #
    # def send_update_to_frontend(pair_symbol, data):
    #     channel_layer = get_channel_layer()
    #     room_group_name = f'market_data_{pair_symbol.lower()}'
    #     async_to_sync(channel_layer.group_send)(
    #         room_group_name,
    #         {
    #             'type': 'market_data_update', # This calls the market_data_update method in consumer
    #             'message': data
    #         }
    #     )