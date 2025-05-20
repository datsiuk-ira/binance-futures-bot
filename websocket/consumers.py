# websocket/consumers.py
import json
import asyncio
from channels.generic.websocket import AsyncWebsocketConsumer
from binance.client import Client as BinanceClient  # Using sync client for this example manager
from binance import AsyncClient, BinanceSocketManager  # For async connections to Binance
from django.conf import settings

# Store active Binance sockets per consumer or globally
# This is a simplified example; robust management is needed for production
active_binance_sockets = {}


class KlineConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.room_name = self.scope['url_route']['kwargs'].get('symbol_interval', 'default_room')
        self.room_group_name = f'klines_{self.room_name}'

        # Join room group
        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name
        )
        await self.accept()
        print(f"WebSocket connected: {self.channel_name}, room: {self.room_group_name}")

        # Start Binance WebSocket connection if not already started for this room_name
        # This logic needs to be more robust (e.g., handle multiple consumers for same stream)
        if self.room_name not in active_binance_sockets:
            parts = self.room_name.split('_')
            if len(parts) == 2:
                symbol, interval = parts[0].upper(), parts[1].lower()
                print(f"Attempting to start Binance KLine stream for {symbol}@{interval}")
                asyncio.create_task(self.start_binance_kline_stream(symbol, interval))

    async def disconnect(self, close_code):
        print(f"WebSocket disconnected: {self.channel_name}, room: {self.room_group_name}")
        # Leave room group
        await self.channel_layer.group_discard(
            self.room_group_name,
            self.channel_name
        )
        # Consider stopping Binance stream if no consumers are left for this room_name
        # This part needs careful management.

    # Receive message from WebSocket (not used in this direction for now)
    async def receive(self, text_data):
        pass  # Or handle subscription changes from client

    # Receive message from room group (from Binance stream)
    async def kline_message(self, event):
        message = event['message']
        # Send message to WebSocket
        await self.send(text_data=json.dumps(message))

    async def start_binance_kline_stream(self, symbol, interval):
        client = await AsyncClient.create(settings.BINANCE_API_KEY, settings.BINANCE_SECRET_KEY)

        bsm = BinanceSocketManager(client)
        stream_name = f"{symbol.lower()}@kline_{interval}"

        # Store the task or socket manager instance to manage it
        active_binance_sockets[self.room_name] = bsm  # Simplified storage

        async with bsm.kline_socket(symbol=symbol, interval=interval) as stream:
            print(f"Binance KLine stream started for {stream_name}")
            while True:
                try:
                    res = await stream.recv()
                    # Process kline data from Binance
                    # res is like:
                    # {
                    #   "e": "kline",         // Event type
                    #   "E": 1638783889598,   // Event time
                    #   "s": "BTCUSDT",       // Symbol
                    #   "k": {
                    #     "t": 1638783840000, // Kline start time
                    #     "T": 1638783900000, // Kline close time
                    #     "s": "BTCUSDT",     // Symbol
                    #     "i": "1m",          // Interval
                    #     "f": 100,           // First trade ID
                    #     "L": 200,           // Last trade ID
                    #     "o": "0.0010",      // Open price
                    #     "c": "0.0020",      // Close price
                    #     "h": "0.0025",      // High price
                    #     "l": "0.0015",      // Low price
                    #     "v": "1000",        // Base asset volume
                    #     "n": 100,           // Number of trades
                    #     "x": false,         // Is this kline closed?
                    #     "q": "1.0000",      // Quote asset volume
                    #     "V": "500",         // Taker buy base asset volume
                    #     "Q": "0.500",       // Taker buy quote asset volume
                    #     "B": "12345"        // Ignore
                    #   }
                    # }

                    print(f"Received from Binance: {res}")
                    if res and 'k' in res:
                        kline_data = res['k']
                        # Send to group
                        print(f"Sending to group {self.room_group_name}: {kline_data}")
                        await self.channel_layer.group_send(
                            self.room_group_name,
                            {
                                'type': 'kline.message',  # This will call kline_message method
                                'message': {
                                    'time': kline_data['t'] / 1000,  # Convert to seconds for chart
                                    'open': float(kline_data['o']),
                                    'high': float(kline_data['h']),
                                    'low': float(kline_data['l']),
                                    'close': float(kline_data['c']),
                                    'isClosed': kline_data['x'],
                                    'symbol': kline_data['s'],
                                    'interval': kline_data['i']
                                }
                            }
                        )
                except Exception as e:
                    print(f"Error in Binance KLine stream for {stream_name}: {e}")
                    # Handle reconnection or stream closure
                    break  # Exit loop on error

        await client.close_connection()
        print(f"Binance KLine stream stopped for {stream_name}")
        if self.room_name in active_binance_sockets:
            del active_binance_sockets[self.room_name]  # Clean up
