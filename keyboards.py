from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup


def _l(lang: str, ru: str, en: str) -> str:
    return ru if lang == "ru" else en


def main_menu_kb(*, is_admin: bool, lang: str = "ru") -> InlineKeyboardMarkup:
    rows: list[list[InlineKeyboardButton]] = [
        [
            InlineKeyboardButton(text=_l(lang, "Купить", "Buy"), callback_data="nav:buy"),
            InlineKeyboardButton(text=_l(lang, "Товары", "Products"), callback_data="nav:products"),
        ],
        [
            InlineKeyboardButton(text=_l(lang, "Отзывы", "Reviews"), callback_data="nav:reviews"),
            InlineKeyboardButton(text=_l(lang, "Поддержка", "Support"), callback_data="nav:support"),
        ],
        [
            InlineKeyboardButton(text="FAQ", callback_data="nav:faq"),
            InlineKeyboardButton(
                text=_l(lang, "Политика конфиденциальности", "Privacy Policy"),
                callback_data="nav:privacy",
            ),
        ],
        [InlineKeyboardButton(text=_l(lang, "Смена языка", "Change language"), callback_data="nav:lang")],
    ]
    if is_admin:
        rows.append([InlineKeyboardButton(text=_l(lang, "Админка", "Admin"), callback_data="nav:admin")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def buy_menu_kb(*, is_admin: bool, lang: str = "ru") -> InlineKeyboardMarkup:
    rows: list[list[InlineKeyboardButton]] = [
        [InlineKeyboardButton(text=_l(lang, "Купить 1 месяц", "Buy 1 month"), callback_data="buy:month")],
        [InlineKeyboardButton(text=_l(lang, "Купить 1 год", "Buy 1 year"), callback_data="buy:year")],
        [InlineKeyboardButton(text=_l(lang, "Моя подписка", "My subscription"), callback_data="nav:sub")],
        [InlineKeyboardButton(text=_l(lang, "Назад", "Back"), callback_data="nav:shop")],
    ]
    if is_admin:
        rows.append([InlineKeyboardButton(text=_l(lang, "Админка", "Admin"), callback_data="nav:admin")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def products_kb(*, lang: str = "ru") -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text=_l(lang, "Купить", "Buy"), callback_data="nav:buy")],
            [InlineKeyboardButton(text=_l(lang, "Назад", "Back"), callback_data="nav:shop")],
        ]
    )


def language_kb(*, lang: str = "ru") -> InlineKeyboardMarkup:
    ru = "Русский ✅" if lang == "ru" else "Русский"
    en = "English ✅" if lang == "en" else "English"
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(text=ru, callback_data="lang:set:ru"),
                InlineKeyboardButton(text=en, callback_data="lang:set:en"),
            ],
            [InlineKeyboardButton(text=_l(lang, "Назад", "Back"), callback_data="nav:shop")],
        ]
    )


def order_kb(order_id: int, *, is_admin: bool, lang: str = "ru") -> InlineKeyboardMarkup:
    rows: list[list[InlineKeyboardButton]] = [
        [InlineKeyboardButton(text=_l(lang, "Я оплатил", "I paid"), callback_data=f"paid:{order_id}")],
        [InlineKeyboardButton(text=_l(lang, "Назад", "Back"), callback_data="nav:buy")],
    ]
    if is_admin:
        rows.append([InlineKeyboardButton(text=_l(lang, "Админка", "Admin"), callback_data="nav:admin")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def proof_wait_kb(*, is_admin: bool, lang: str = "ru") -> InlineKeyboardMarkup:
    rows: list[list[InlineKeyboardButton]] = [
        [InlineKeyboardButton(text=_l(lang, "Отмена", "Cancel"), callback_data="nav:shop")],
    ]
    if is_admin:
        rows.append([InlineKeyboardButton(text=_l(lang, "Админка", "Admin"), callback_data="nav:admin")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def renew_kb(*, is_admin: bool, lang: str = "ru") -> InlineKeyboardMarkup:
    rows: list[list[InlineKeyboardButton]] = [
        [InlineKeyboardButton(text=_l(lang, "Продлить 1 месяц", "Renew 1 month"), callback_data="buy:month")],
        [InlineKeyboardButton(text=_l(lang, "Продлить 1 год", "Renew 1 year"), callback_data="buy:year")],
        [InlineKeyboardButton(text=_l(lang, "Назад", "Back"), callback_data="nav:shop")],
    ]
    if is_admin:
        rows.append([InlineKeyboardButton(text=_l(lang, "Админка", "Admin"), callback_data="nav:admin")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def simple_back_kb(*, is_admin: bool, lang: str = "ru") -> InlineKeyboardMarkup:
    rows = [[InlineKeyboardButton(text=_l(lang, "Назад", "Back"), callback_data="nav:shop")]]
    if is_admin:
        rows.append([InlineKeyboardButton(text=_l(lang, "Админка", "Admin"), callback_data="nav:admin")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def admin_menu_kb() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="Статистика", callback_data="admin:stats")],
            [InlineKeyboardButton(text="Заказы (ожидают)", callback_data="admin:pending")],
            [InlineKeyboardButton(text="Подписки (истекают)", callback_data="admin:expiring")],
            [InlineKeyboardButton(text="Выдать подписку", callback_data="admin:grant")],
            [InlineKeyboardButton(text="Рассылка", callback_data="admin:bcast")],
            [InlineKeyboardButton(text="Назад", callback_data="nav:shop")],
        ]
    )

def admin_pending_list_kb(order_ids: list[int]) -> InlineKeyboardMarkup:
    rows: list[list[InlineKeyboardButton]] = []
    for oid in order_ids[:10]:
        rows.append(
            [
                InlineKeyboardButton(text=f"#{oid}", callback_data=f"admin:view:{oid}"),
                InlineKeyboardButton(text="✅", callback_data=f"admin:ok:{oid}"),
                InlineKeyboardButton(text="❌", callback_data=f"admin:no:{oid}"),
            ]
        )
    rows.append(
        [
            InlineKeyboardButton(text="Обновить", callback_data="admin:pending"),
            InlineKeyboardButton(text="Назад", callback_data="nav:admin"),
        ]
    )
    return InlineKeyboardMarkup(inline_keyboard=rows)


def admin_order_kb(order_id: int, *, with_back: bool = False) -> InlineKeyboardMarkup:
    rows = [
        [
            InlineKeyboardButton(text="Подтвердить", callback_data=f"admin:ok:{order_id}"),
            InlineKeyboardButton(text="Отклонить", callback_data=f"admin:no:{order_id}"),
        ]
    ]
    if with_back:
        rows.append([InlineKeyboardButton(text="К списку заказов", callback_data="admin:pending")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def admin_bcast_target_kb() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="Всем", callback_data="admin:bcast_target:all")],
            [InlineKeyboardButton(text="Активным", callback_data="admin:bcast_target:active")],
            [InlineKeyboardButton(text="Истекающим", callback_data="admin:bcast_target:expiring")],
            [InlineKeyboardButton(text="Отмена", callback_data="nav:admin")],
        ]
    )


def admin_bcast_cancel_kb() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="Отмена рассылки", callback_data="admin:bcast_cancel")],
            [InlineKeyboardButton(text="Назад", callback_data="nav:admin")],
        ]
    )


def admin_grant_plan_kb() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="1 месяц", callback_data="admin:grant_plan:month")],
            [InlineKeyboardButton(text="1 год", callback_data="admin:grant_plan:year")],
            [InlineKeyboardButton(text="Отмена", callback_data="nav:admin")],
        ]
    )


def admin_grant_cancel_kb() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="Отмена выдачи", callback_data="admin:grant_cancel")],
            [InlineKeyboardButton(text="Назад", callback_data="nav:admin")],
        ]
    )


def admin_back_to_pending_kb() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="К заказам", callback_data="admin:pending")],
            [InlineKeyboardButton(text="Назад", callback_data="nav:admin")],
        ]
    )
