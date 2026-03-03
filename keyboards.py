from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup


def _nav_rows(*, is_admin: bool) -> list[list[InlineKeyboardButton]]:
    rows: list[list[InlineKeyboardButton]] = [
        [
            InlineKeyboardButton(text="Магазин", callback_data="nav:shop"),
            InlineKeyboardButton(text="Моя подписка", callback_data="nav:sub"),
        ],
        [
            InlineKeyboardButton(text="FAQ", callback_data="nav:faq"),
            InlineKeyboardButton(text="Отзывы", callback_data="nav:reviews"),
            InlineKeyboardButton(text="Условия", callback_data="nav:terms"),
        ],
        [
            InlineKeyboardButton(text="Поддержка", callback_data="nav:support"),
        ],
    ]
    if is_admin:
        rows.append([InlineKeyboardButton(text="Админка", callback_data="nav:admin")])
    return rows


def shop_kb(*, is_admin: bool) -> InlineKeyboardMarkup:
    rows: list[list[InlineKeyboardButton]] = [
        [InlineKeyboardButton(text="Купить 1 месяц", callback_data="buy:month")],
        [InlineKeyboardButton(text="Купить 1 год", callback_data="buy:year")],
    ]
    rows.extend(_nav_rows(is_admin=is_admin))
    return InlineKeyboardMarkup(inline_keyboard=rows)


def order_kb(order_id: int, *, is_admin: bool) -> InlineKeyboardMarkup:
    rows: list[list[InlineKeyboardButton]] = [
        [InlineKeyboardButton(text="Я оплатил", callback_data=f"paid:{order_id}")],
        [InlineKeyboardButton(text="Назад в магазин", callback_data="nav:shop")],
    ]
    rows.extend(_nav_rows(is_admin=is_admin))
    return InlineKeyboardMarkup(inline_keyboard=rows)


def proof_wait_kb(*, is_admin: bool) -> InlineKeyboardMarkup:
    rows: list[list[InlineKeyboardButton]] = [
        [InlineKeyboardButton(text="Отмена", callback_data="nav:shop")],
    ]
    rows.extend(_nav_rows(is_admin=is_admin))
    return InlineKeyboardMarkup(inline_keyboard=rows)


def renew_kb(*, is_admin: bool) -> InlineKeyboardMarkup:
    rows: list[list[InlineKeyboardButton]] = [
        [InlineKeyboardButton(text="Продлить 1 месяц", callback_data="buy:month")],
        [InlineKeyboardButton(text="Продлить 1 год", callback_data="buy:year")],
        [InlineKeyboardButton(text="В магазин", callback_data="nav:shop")],
    ]
    rows.extend(_nav_rows(is_admin=is_admin))
    return InlineKeyboardMarkup(inline_keyboard=rows)


def simple_back_kb(*, is_admin: bool) -> InlineKeyboardMarkup:
    rows = [[InlineKeyboardButton(text="Назад в магазин", callback_data="nav:shop")]]
    rows.extend(_nav_rows(is_admin=is_admin))
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
