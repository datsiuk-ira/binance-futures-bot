# backend/celery.py
import os
from celery import Celery

# Встановлюємо змінну оточення для налаштувань Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')

app = Celery('backend') # Назва вашого проєкту

# Використовуємо конфігурацію з Django settings, префікс 'CELERY_'
app.config_from_object('django.conf:settings', namespace='CELERY')

# Автоматичне виявлення тасків у всіх зареєстрованих Django додатках
app.autodiscover_tasks()

@app.task(bind=True, ignore_result=True)
def debug_task(self):
    print(f'Request: {self.request!r}')