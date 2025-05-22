# websocket/consumers.py
import json
import asyncio
import httpx
import pandas as pd
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async  # For Django ORM calls if needed
from django.conf import settings
from urllib.parse import parse_qs

# Assuming your new indicator calculation file is in the 'indicators' app
# Adjust the import path if your project structure is different.
from indicators.technical_indicators import get_all_indicators, generate_trading_signals

# Define a dictionary to store k-line data for each symbol and interval
# This will act as a rolling window for indicator calculations.
# Structure: { 'symbol_interval': pd.DataFrame }
# MAX_KLINES_MEMORY: Max number of klines to keep in memory for calculations. Adjust as needed.
# Needs to be enough for the longest period indicator (e.g., EMA200, SMA200 needs at least 200 points).
MAX_KLINES_MEMORY = getattr(settings, 'MAX_KLINES_MEMORY_FOR_INDICATORS', 500)


class MarketDataConsumer(AsyncWebsocketConsumer):
    # In-memory storage for k-line data per connection (or globally if preferred)
    # For this example, klines_data is instance-specific.
    # For a shared cache across consumers, consider Redis or Django's cache framework.

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.klines_data = {}  # Stores pd.DataFrame for symbol_interval
        self.binance_ws_url = None
        self.subscription_streams = []
        self.client = None  # httpx.AsyncClient()
        self.binance_ws_task = None
        self.user = None  # If you need user-specific logic/settings

    async def connect(self):
        # Extract query parameters (symbol, interval) from the WebSocket path
        query_string = self.scope['query_string'].decode()
        params = parse_qs(query_string)

        self.symbol = params.get('symbol', [None])[0]
        self.kline_interval = params.get('interval', ['1m'])[0]  # Default to '1m' if not provided
        self.user = self.scope.get("user", None)  # Get user if auth middleware is used

        if not self.symbol:
            await self.close(code=4000, reason="Symbol parameter is required.")
            return

        self.symbol_lower = self.symbol.lower()
        self.stream_name = f"{self.symbol_lower}@kline_{self.kline_interval}"
        self.group_name = f"market_data_{self.symbol_lower}_{self.kline_interval}"

        # Join room group
        await self.channel_layer.group_add(
            self.group_name,
            self.channel_name
        )
        await self.accept()

        # Initialize httpx.AsyncClient here
        self.client = httpx.AsyncClient()

        # Fetch initial k-lines to populate historical data for indicators
        await self.fetch_initial_klines()

        # Construct Binance WebSocket URL
        # Use fstream for futures, stream for spot if needed
        self.binance_ws_url = f"{settings.BINANCE_FUTURES_WS_BASE_URL}/ws/{self.stream_name}"
        # If you need multiple streams (e.g., depth, ticker) add them to a list
        # self.binance_ws_url = f"{settings.BINANCE_FUTURES_WS_BASE_URL}/stream?streams={self.stream_name}"

        # Start a background task to connect to Binance WebSocket
        self.binance_ws_task = asyncio.create_task(self.binance_listener())

    async def disconnect(self, close_code):
        if self.client:
            await self.client.aclose()  # Close httpx client

        if self.binance_ws_task:
            self.binance_ws_task.cancel()
            try:
                await self.binance_ws_task
            except asyncio.CancelledError:
                pass  # Task cancellation is expected

        # Leave room group
        if hasattr(self, 'group_name'):
            await self.channel_layer.group_discard(
                self.group_name,
                self.channel_name
            )

        # Clean up k-line data for this connection if instance-specific
        if hasattr(self, 'data_key') and self.data_key in self.klines_data:
            del self.klines_data[self.data_key]

    async def fetch_initial_klines(self):
        """Fetches initial historical k-lines to populate data for indicators."""
        # Binance API endpoint for klines (futures)
        # Adjust limit as needed, max usually 1000 or 1500 for UMFutures
        # Ensure enough data for longest indicator period (e.g., 200 for EMA200/SMA200)
        url = f"{settings.BINANCE_FUTURES_API_BASE_URL}/fapi/v1/klines"
        params = {
            'symbol': self.symbol,
            'interval': self.kline_interval,
            'limit': MAX_KLINES_MEMORY
        }
        try:
            response = await self.client.get(url, params=params)
            response.raise_for_status()
            klines_raw = response.json()

            if not klines_raw:
                await self.send(text_data=json.dumps({"error": "No initial kline data received."}))
                return

            # Process k-lines into a DataFrame
            # Columns: timestamp, open, high, low, close, volume, close_time, quote_asset_volume, number_of_trades, taker_buy_base_asset_volume, taker_buy_quote_asset_volume, ignore
            df = pd.DataFrame(klines_raw, columns=[
                'timestamp', 'open', 'high', 'low', 'close', 'volume',
                'close_time', 'quote_asset_volume', 'number_of_trades',
                'taker_buy_base_asset_volume', 'taker_buy_quote_asset_volume', 'ignore'
            ])
            df = df[['timestamp', 'open', 'high', 'low', 'close', 'volume']].astype({
                'timestamp': 'int64',  # Keep as Unix MS for consistency
                'open': 'float',
                'high': 'float',
                'low': 'float',
                'close': 'float',
                'volume': 'float'
            })

            # Store in our in-memory cache
            self.data_key = f"{self.symbol}_{self.kline_interval}"
            self.klines_data[self.data_key] = df

            # Calculate indicators with initial data and send
            await self.process_and_send_indicators(df)

        except httpx.HTTPStatusError as e:
            await self.send(text_data=json.dumps(
                {"error": f"HTTP error fetching initial klines: {e.response.status_code} - {e.response.text}"}))
        except Exception as e:
            await self.send(text_data=json.dumps({"error": f"Error fetching initial klines: {str(e)}"}))

    async def binance_listener(self):
        """Listens to Binance WebSocket for real-time k-line updates."""
        try:
            # Using 'websockets' library directly as httpx doesn't have native WebSocket client yet for this type of persistent connection.
            # Alternatively, a library like 'aiohttp' could be used for WebSocket client.
            # For simplicity, this example implies a direct websocket connection setup.
            # You might need to install 'websockets': pip install websockets
            import websockets
            async with websockets.connect(self.binance_ws_url) as ws:
                while True:
                    try:
                        message_str = await ws.recv()
                        message = json.loads(message_str)

                        # Process k-line update
                        if message.get('e') == 'kline':  # Check event type
                            kline_data = message['k']
                            await self.handle_kline_update(kline_data)

                    except websockets.exceptions.ConnectionClosed:
                        # Handle reconnection logic if needed
                        # For now, just log and break
                        print(f"Binance WebSocket connection closed for {self.stream_name}. Attempting to reconnect...")
                        await asyncio.sleep(5)  # Wait before retrying
                        # Re-run the listener (simple retry)
                        # More robust reconnection would involve a loop and backoff strategy
                        self.binance_ws_task = asyncio.create_task(self.binance_listener())
                        return  # Exit this failed task
                    except Exception as e:
                        print(f"Error processing message from Binance for {self.stream_name}: {e}")
                        # Continue listening unless it's a critical error
        except asyncio.CancelledError:
            print(f"Binance listener for {self.stream_name} cancelled.")
            raise  # Re-raise CancelledError to be caught by disconnect
        except Exception as e:
            print(f"Failed to connect or critical error in Binance listener for {self.stream_name}: {e}")
            # Send error to client if connection is still active
            if self.channel_layer:
                await self.send(
                    text_data=json.dumps({"error": f"WebSocket connection to Binance failed for {self.stream_name}."}))

    async def handle_kline_update(self, kline_data):
        """Handles an incoming k-line update from Binance."""
        # kline_data fields:
        # t: Kline start time (timestamp)
        # T: Kline close time (timestamp)
        # s: Symbol
        # i: Interval
        # o: Open price
        # c: Close price
        # h: High price
        # l: Low price
        # v: Base asset volume
        # x: Is this kline closed? (boolean)

        if not self.data_key in self.klines_data or self.klines_data[self.data_key] is None:
            # Data not initialized yet, might happen if initial fetch failed or is slow
            # Could queue this update or fetch initial klines again.
            # For now, we'll wait for initial fetch to complete.
            print(f"Kline data for {self.data_key} not yet initialized. Skipping update.")
            return

        current_df = self.klines_data[self.data_key]

        new_kline = {
            'timestamp': kline_data['t'],
            'open': float(kline_data['o']),
            'high': float(kline_data['h']),
            'low': float(kline_data['l']),
            'close': float(kline_data['c']),
            'volume': float(kline_data['v'])
        }

        # Convert to DataFrame to easily merge or append
        new_kline_df = pd.DataFrame([new_kline])

        # If the timestamp of the new kline matches the last one, update it
        # Otherwise, if it's a new kline (is_closed = True), append it
        if not current_df.empty and current_df['timestamp'].iloc[-1] == new_kline['timestamp']:
            current_df.iloc[-1] = new_kline_df.iloc[0]  # Update last row
        else:
            # Append new kline if it's closed or simply to reflect the ongoing candle
            current_df = pd.concat([current_df, new_kline_df], ignore_index=True)

        # Keep the DataFrame size managed
        if len(current_df) > MAX_KLINES_MEMORY:
            current_df = current_df.iloc[-MAX_KLINES_MEMORY:]

        self.klines_data[self.data_key] = current_df

        # Calculate indicators and send to group
        await self.process_and_send_indicators(current_df.copy())  # Send a copy to avoid modification issues if async

    async def process_and_send_indicators(self, df_for_indicators: pd.DataFrame):
        """Calculates indicators and sends them to the WebSocket group."""
        if df_for_indicators.empty or len(
                df_for_indicators) < 2:  # Need at least 2 data points for some calcs like diff
            # Not enough data to calculate most indicators
            # Send only the klines if available
            ohlcv_data_list = df_for_indicators.to_dict(orient='records')
            await self.channel_layer.group_send(
                self.group_name,
                {
                    'type': 'marketdata.update',  # This will call marketdata_update method
                    'message': {
                        'type': 'kline_with_indicators',
                        'symbol': self.symbol,
                        'interval': self.kline_interval,
                        'klines': ohlcv_data_list,  # Send raw klines
                        'indicators': {},  # Empty indicators
                        'signals': []  # Empty signals
                    }
                }
            )
            return

        try:
            # Use indicator_settings from User's Strategy model if available
            # For now, using default settings from get_all_indicators
            # indicator_config = await self.get_user_indicator_settings() # Example
            indicator_config = None  # Will use defaults in get_all_indicators

            indicator_values = get_all_indicators(df_for_indicators, indicator_settings=indicator_config)

            # Generate trading signals based on the calculated indicators
            # Ensure df_for_indicators has a datetime index if generate_trading_signals expects it
            # df_for_signals = df_for_indicators.set_index(pd.to_datetime(df_for_indicators['timestamp'], unit='ms'))
            # trading_signals_series = generate_trading_signals(indicator_values, df_for_signals)
            # trading_signals = [{'timestamp': ts.value // 10**6, 'signal': sig} for ts, sig in trading_signals_series.items()]

            # Simpler signal generation (last signal based on last data points)
            # You might want to implement a more robust signal generation logic
            # For now, let's assume generate_trading_signals processes the structure from get_all_indicators
            # and returns a list of signals or the latest signal.
            # This part needs refinement based on actual strategy implementation.

            # For this example, let's assume `generate_trading_signals` uses the dictionary
            # from `get_all_indicators` and the original kline DataFrame.
            trading_signals_series = generate_trading_signals(indicator_values, df_for_indicators)

            # Prepare signals to be sent: [{timestamp: ts, signal: 'BUY'/'SELL'/'HOLD', details: {...}}, ...]
            # We'll send the full series of signals for now, frontend can pick the latest or display history.
            # Ensure timestamps in signals align with kline timestamps.
            # The `generate_trading_signals` should return a pd.Series indexed by datetime.
            # We convert it back to match the OHLCV list structure.

            # Convert the klines DataFrame to a list of dicts for JSON serialization
            ohlcv_data_list = df_for_indicators.to_dict(orient='records')

            # Align signals with the ohlcv_data_list
            aligned_signals = []
            if not trading_signals_series.empty:
                temp_signal_df = trading_signals_series.reset_index()
                temp_signal_df.columns = ['datetime', 'signal_value']
                temp_signal_df['timestamp'] = temp_signal_df['datetime'].astype(np.int64) // 10 ** 6  # Convert to ms

                # Merge signals with ohlcv_data to ensure alignment or map by timestamp
                # For simplicity, we assume the frontend can map signals by timestamp from indicator_values['timestamps']
                # or we can embed the signal directly into each kline object.
                # Let's add the signal to each kline object for direct use in frontend.

                # Create a dictionary for quick signal lookup by timestamp
                signal_map = {row['timestamp']: row['signal_value'] for _, row in temp_signal_df.iterrows()}

                for kline_point in ohlcv_data_list:
                    kline_point['signal'] = signal_map.get(kline_point['timestamp'], 'HOLD')  # Default to HOLD

            payload = {
                'type': 'kline_with_indicators',  # Custom message type for frontend
                'symbol': self.symbol,
                'interval': self.kline_interval,
                'klines': ohlcv_data_list,  # This now includes the 'signal' field
                'indicators': indicator_values,
                # 'signals': trading_signals # Or send signals separately if preferred
            }

            await self.channel_layer.group_send(
                self.group_name,
                {
                    'type': 'marketdata.update',  # This will call marketdata_update method
                    'message': payload
                }
            )
        except Exception as e:
            print(f"Error calculating or sending indicators for {self.data_key}: {str(e)}")
            # Optionally send an error message to the client
            await self.send(text_data=json.dumps({
                "error": f"Error processing indicator data for {self.symbol}: {str(e)}"
            }))

    # Receive message from WebSocket (if client sends any, not typical for market data stream)
    async def receive(self, text_data):
        # text_data_json = json.loads(text_data)
        # message = text_data_json['message']
        # For market data, client usually just listens.
        # Could be used for changing symbol/interval on the fly if desired.
        pass

    # Receive message from room group
    async def marketdata_update(self, event):
        message = event['message']
        # Send message to WebSocket
        await self.send(text_data=json.dumps(message))

    # Example: Fetch user-specific indicator settings from DB
    # @database_sync_to_async
    # def get_user_indicator_settings(self):
    #     if self.user and self.user.is_authenticated:
    #         try:
    #             # Assuming you have a UserProfile or Strategy model linked to User
    #             # with indicator settings stored as JSONField or similar.
    #             # strategy = UserStrategy.objects.get(user=self.user, symbol=self.symbol, interval=self.kline_interval, is_active=True)
    #             # return strategy.indicator_settings
    #             pass # Replace with actual model query
    #         except Exception: # UserStrategy.DoesNotExist or other errors
    #             return None # Fallback to default
    #     return None