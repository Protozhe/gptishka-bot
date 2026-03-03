APP_NAME = "Магазин подписок"


MAIN_MENU_TEXT_RU = "Выберите нужный раздел:"
MAIN_MENU_TEXT_EN = "Choose a section:"


BUY_MENU_TEXT_RU = (
    "Покупка подписки.\n\n"
    "Выберите тариф:"
)


BUY_MENU_TEXT_EN = (
    "Subscription purchase.\n\n"
    "Choose a plan:"
)


PRODUCTS_TEXT_RU = (
    "Товары:\n\n"
    "• Подписка 1 месяц\n"
    "• Подписка 1 год\n\n"
    "Нажмите «Купить», чтобы перейти к оплате."
)


PRODUCTS_TEXT_EN = (
    "Products:\n\n"
    "• Subscription 1 month\n"
    "• Subscription 1 year\n\n"
    "Tap \"Buy\" to continue to payment."
)


LANGUAGE_TEXT_RU = "Выберите язык интерфейса:"
LANGUAGE_TEXT_EN = "Choose interface language:"


LANGUAGE_CHANGED_RU = "Язык изменен."
LANGUAGE_CHANGED_EN = "Language changed."


PRIVACY_TEXT_RU = (
    "Политика конфиденциальности\n\n"
    "Мы обрабатываем только данные, необходимые для работы бота:\n"
    "• Telegram ID и публичные данные профиля\n"
    "• данные по заказам и подписке\n\n"
    "Данные не передаются третьим лицам, кроме случаев, необходимых для оплаты и выполнения услуги."
)


PRIVACY_TEXT_EN = (
    "Privacy Policy\n\n"
    "We process only data required to run the bot:\n"
    "• Telegram ID and public profile data\n"
    "• order and subscription details\n\n"
    "Data is not shared with third parties except where needed for payment and service delivery."
)


PAYMENT_INSTRUCTIONS_TEMPLATE = (
    "Заказ #{order_id}\n"
    "Тариф: {plan_name}\n"
    "Сумма: {amount_rub} ₽\n"
    "Создан: {created_at}\n\n"
    "Оплата (Lava): {payment_link}\n\n"
    "После оплаты нажмите «Я оплатил»."
)


NEED_PAYMENT_PROOF = (
    "Пришлите одним сообщением любой идентификатор/комментарий платежа, чтобы админ мог сверить оплату.\n\n"
    "Пример: номер операции, комментарий, скрин (как текст), и т.п."
)


PAYMENT_PROOF_ACCEPTED = "Принято. Ожидайте подтверждения админом."


SUBSCRIPTION_STATUS_TEMPLATE = (
    "Моя подписка:\n\n"
    "Тариф: {plan_name}\n"
    "Активна до: {ends_at}\n"
    "Осталось: {left}\n"
)


NO_SUBSCRIPTION_TEXT = (
    "Активной подписки нет.\n\n"
    "Откройте магазин и оформите заказ."
)


REMIND_TEMPLATE = (
    "Напоминание: подписка скоро закончится.\n\n"
    "Тариф: {plan_name}\n"
    "Активна до: {ends_at}\n\n"
    "Хотите продлить?"
)


FAQ_TEXT = (
    "FAQ\n\n"
    "1) Как оплатить?\n"
    "Выберите тариф в магазине и перейдите по ссылке оплаты.\n\n"
    "2) Когда активируется?\n"
    "После подтверждения оплаты администратором.\n\n"
    "3) Не получается оплатить\n"
    "Напишите в поддержку."
)


REVIEWS_TEXT = (
    "Отзывы\n\n"
    "Смотреть отзывы: https://t.me/otzivigptishkashop"
)


TERMS_TEXT = (
    "Условия покупки\n\n"
    "• Оплата производится через платежную систему.\n"
    "• Активация после подтверждения оплаты.\n"
    "• Возвраты/споры: через поддержку.\n\n"
    "Текст условий можно заменить на ваш официальный документ."
)


SUPPORT_TEXT = (
    "Поддержка\n\n"
    "Опишите проблему одним сообщением.\n"
    "Если есть заказ: укажите номер заказа."
)


ADMIN_ONLY = "Доступно только администратору."
