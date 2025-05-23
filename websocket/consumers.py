# websocket/consumers.py
import json
import asyncio
import logging
from channels.generic.websocket import AsyncWebsocketConsumer
# from channels.db import database_sync_to_async # Якщо не використовується

logger = logging.getLogger(__name__)

class MarketDataConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.pair_symbol = self.scope['url_route']['kwargs']['pair_symbol'].lower()
        self.room_group_name = f'market_data_{self.pair_symbol}'
        self.current_interval = '1m' # Можна отримувати від клієнта

        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name
        )
        await self.accept()
        await self.send(text_data=json.dumps({
            'type': 'connection_established',
            'message': f'Connected to market data for {self.pair_symbol.upper()}'
        }))
        logger.info(f"WebSocket connected for {self.pair_symbol}, added to group {self.room_group_name}")

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(
            self.room_group_name,
            self.channel_name
        )
        logger.info(f"WebSocket disconnected for {self.pair_symbol} from group {self.room_group_name}")

    async def receive(self, text_data=None, bytes_data=None):
        # Цей метод тепер в основному для керуючих повідомлень від клієнта,
        # наприклад, зміна підписки на інтервал, якщо це потрібно динамічно
        # змінювати для Celery тасків (це складніше).
        # Або для ping/pong.
        try:
            if text_data:
                text_data_json = json.loads(text_data)
                message_type = text_data_json.get('type')
                payload = text_data_json.get('payload')

                if message_type == 'subscribe_kline':
                    # Клієнт надсилає бажаний інтервал.
                    # Зараз Celery Beat працює за фіксованим розкладом з settings.py.
                    # Щоб динамічно змінювати інтервали для Celery, потрібна складніша логіка:
                    # - Зберігати активні підписки (символ, інтервал, канал)
                    # - Celery таск (або інший механізм) має вирішувати, які дані генерувати
                    #   на основі активних підписок.
                    # - Або мати окремі Celery Beat розклади для кожного інтервалу,
                    #   а клієнт просто підключається до кімнати відповідного символу,
                    #   а дані для різних інтервалів надсилаються в ту ж групу,
                    #   але з різним полем 'interval' у повідомленні.
                    #   Фронтенд тоді фільтрує потрібний інтервал.
                    #
                    # Для простоти поки що цей subscribe_kline може бути лише для підтвердження.
                    # Або, якщо ви хочете мати ОДИН Celery таск, що періодично запитує дані
                    # для КОЖНОГО активного підключення з його інтервалом - це теж можливо,
                    # але потребує зберігання стану підключень.

                    interval = payload.get('interval', '1m')
                    self.current_interval = interval # Зберігаємо для контексту
                    logger.info(f"Client for {self.pair_symbol} expressed interest in interval: {interval}")
                    await self.send(text_data=json.dumps({
                        'type': 'subscription_ack',
                        'message': f'Subscription preference for {interval} noted. Market data is pushed by scheduled tasks.'
                    }))
                elif message_type == 'ping':
                    await self.send(text_data=json.dumps({'type': 'pong'}))
                else:
                    logger.warning(f"Received unknown message type from client: {text_data_json}")
        except Exception as e:
            logger.error(f"Error in MarketDataConsumer.receive: {e}", exc_info=True)


    async def market_data_update(self, event):
        """
        Обробляє повідомлення, надіслані з Celery таску до групи.
        """
        try:
            logger.debug(f"Consumer for {self.pair_symbol} received market_data_update event: {event}")
            message_payload = event.get('message_payload', {})
            event_interval = event.get('interval', 'unknown_interval')

            # Важливо: надсилаємо дані клієнту
            await self.send(text_data=json.dumps({
                'type': 'kline_with_indicators',
                'symbol': self.pair_symbol.upper(), # Символ з URL цього consumer'a
                'interval': event_interval, # Інтервал з Celery таску
                'klines': message_payload.get('klines', []),
                'indicators': message_payload.get('indicators', None),
                'error': message_payload.get('error', None)
            }))
            logger.debug(f"Sent kline_with_indicators for {self.pair_symbol} {event_interval} to client {self.channel_name}")
        except Exception as e:
            logger.error(f"Error in MarketDataConsumer.market_data_update: {e}", exc_info=True)