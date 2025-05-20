from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import User
from django.utils.translation import gettext_lazy as _


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    model = User
    list_display = ("email", "is_active", "is_staff", "trade_mode", "date_joined", "last_login")
    list_filter = ("is_active", "is_staff", "trade_mode", "date_joined", "last_login")
    search_fields = ("email",)
    ordering = ("-date_joined", "email")

    fieldsets = (
        (None, {"fields": ("email", "password")}),
        (_("Personal info"), {"fields": ()}), # Можна додати сюди поля типу first_name, last_name якщо вони будуть
        (_("Trade Settings"), {"fields": ("balance", "leverage", "risk_percentage", "trade_mode")}),
        (_("Binance API"), {"fields": ("binance_api_key", "binance_secret_key")}),
        (
            _("Permissions"),
            {
                "fields": (
                    "is_active",
                    "is_staff",
                    "is_superuser",
                    "groups",
                    "user_permissions",
                ),
            },
        ),
        (_("Important dates"), {"fields": ("last_login",)}), # date_joined тут не потрібне, воно readonly
    )
    add_fieldsets = (
        (
            None,
            {
                "classes": ("wide",),
                "fields": ("email", "password",), # Для створення достатньо email і password
                                                    # password1, password2 використовуються Django Form, а не DRF Serializer
            },
        ),
    )
    readonly_fields = ("last_login", "date_joined", "balance") # Додаємо date_joined та balance як readonly

    # Для відображення date_joined на сторінці редагування, якщо потрібно (воно вже є в readonly_fields)
    # def get_fieldsets(self, request, obj=None):
    #     fieldsets = super().get_fieldsets(request, obj)
    #     if obj: # For change form
    #         # Find the 'Important dates' fieldset and add date_joined if not present
    #         for fieldset_name, field_options in fieldsets:
    #             if fieldset_name == _("Important dates"):
    #                 if 'date_joined' not in field_options['fields']:
    #                     field_options['fields'] = ('last_login', 'date_joined') + tuple(f for f in field_options['fields'] if f not in ('last_login', 'date_joined'))
    #                 break
    #     return fieldsets

    # Щоб показувати баланс, але не давати редагувати його напряму в адмінці (має змінюватись через торгові операції)
    # Поле balance вже додано до readonly_fields.