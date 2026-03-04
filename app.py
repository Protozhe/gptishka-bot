import asyncio
import logging
from dataclasses import dataclass
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from aiogram import Bot, Dispatcher, F
from aiogram.exceptions import TelegramBadRequest
from aiogram.filters import Command
from aiogram.types import CallbackQuery, Message, ReplyKeyboardRemove

import keyboards as kb
import texts
from config import Settings, load_settings
from db import Database, PLANS, from_iso, utc_now


logging.basicConfig(level=logging.INFO)
log = logging.getLogger("bot")


@dataclass
class State:
    settings: Settings
    db: Database
    tz: ZoneInfo

    # user_id -> "main UI" message_id
    menu_message_id: dict[int, int]

    # user_id -> order_id awaiting proof
    awaiting_payment_proof: dict[int, int]

    # admin_id -> {"step": "text", "target": "all|active|expiring"}
    broadcast_draft: dict[int, dict]

    # admin_id -> {"step": "user_id", "plan_code": "month|year"}
    grant_draft: dict[int, dict]

    # users for whom old ReplyKeyboard was explicitly removed
    reply_kb_removed_users: set[int]


def _is_admin(state: State, user_id: int) -> bool:
    return user_id in state.settings.admin_ids


def _plan_name(plan_code: str) -> str:
    return PLANS[plan_code].name if plan_code in PLANS else plan_code


def _fmt_dt_local(dt: datetime, tz: ZoneInfo) -> str:
    return dt.astimezone(tz).strftime("%Y-%m-%d %H:%M")


def _fmt_left(delta: timedelta) -> str:
    seconds = int(delta.total_seconds())
    if seconds <= 0:
        return "0д 0ч"
    days = seconds // 86400
    hours = (seconds % 86400) // 3600
    return f"{days}д {hours}ч"


def _status_name(status: str) -> str:
    return {
        "pending": "ожидает подтверждения",
        "paid": "оплачен",
        "rejected": "отклонен",
    }.get(status, status)


def _safe_order_id(callback_data: str) -> int | None:
    parts = callback_data.split(":")
    if len(parts) < 3:
        return None
    try:
        return int(parts[2])
    except ValueError:
        return None


def _fmt_order_time(raw: str | None, tz: ZoneInfo) -> str:
    if not raw:
        return "-"
    try:
        return _fmt_dt_local(from_iso(raw), tz)
    except Exception:
        return str(raw)


def _order_admin_text(order: dict, tz: ZoneInfo) -> str:
    return (
        f"Заказ #{order['order_id']}\n\n"
        f"Статус: {_status_name(order['status'])}\n"
        f"User ID: {order['user_id']}\n"
        f"Тариф: {_plan_name(order['plan_code'])}\n"
        f"Сумма: {order['amount_rub']} ₽\n"
        f"Комментарий: {order.get('user_comment') or '-'}\n"
        f"Создан: {_fmt_order_time(order.get('created_at'), tz)}\n"
        f"Обновлён: {_fmt_order_time(order.get('updated_at'), tz)}"
    )


def _clear_admin_drafts(state: State, admin_id: int) -> None:
    state.broadcast_draft.pop(admin_id, None)
    state.grant_draft.pop(admin_id, None)


def _normalize_nav_text(text: str) -> str:
    s = (text or "").strip().lower().replace("ё", "е")
    cleaned: list[str] = []
    for ch in s:
        if ch.isalnum() or ch.isspace():
            cleaned.append(ch)
        else:
            cleaned.append(" ")
    return " ".join("".join(cleaned).split())


def _legacy_text_to_page(text: str) -> str | None:
    norm = _normalize_nav_text(text)
    if not norm:
        return None

    # Legacy bottom ReplyKeyboard button labels.
    if norm in {"магазин"}:
        return "shop"
    if norm in {"моя подписка", "подписка"}:
        return "sub"
    if norm in {"поддержка"}:
        return "support"
    if norm in {"купить"}:
        return "buy"
    if norm in {"товары"}:
        return "products"
    if norm in {"faq"}:
        return "faq"
    if norm in {"политика конфиденциальности", "политика"}:
        return "privacy"
    if norm in {"смена языка", "язык"}:
        return "lang"
    return None


async def _delete_message_safe(bot: Bot, chat_id: int, message_id: int) -> None:
    try:
        await bot.delete_message(chat_id=chat_id, message_id=message_id)
    except Exception:
        pass


def _t(lang: str, ru: str, en: str) -> str:
    return ru if lang == "ru" else en


async def _user_lang(state: State, user_id: int) -> str:
    lang = await state.db.get_user_lang(user_id)
    return lang if lang in {"ru", "en"} else "ru"


async def ui_show(
    *,
    bot: Bot,
    chat_id: int,
    message_id: int | None,
    text: str,
    reply_markup,
) -> int:
    if message_id is not None:
        try:
            await bot.edit_message_text(
                chat_id=chat_id,
                message_id=message_id,
                text=text,
                reply_markup=reply_markup,
            )
            return message_id
        except TelegramBadRequest as e:
            if "message is not modified" in str(e):
                return message_id
        except Exception:
            pass

    msg = await bot.send_message(chat_id=chat_id, text=text, reply_markup=reply_markup)
    return msg.message_id


async def show_shop(*, bot: Bot, state: State, user_id: int, chat_id: int, message_id: int | None) -> int:
    lang = await _user_lang(state, user_id)
    return await ui_show(
        bot=bot,
        chat_id=chat_id,
        message_id=message_id,
        text=texts.MAIN_MENU_TEXT_RU if lang == "ru" else texts.MAIN_MENU_TEXT_EN,
        reply_markup=kb.main_menu_kb(is_admin=_is_admin(state, user_id), lang=lang),
    )


async def show_buy_menu(*, bot: Bot, state: State, user_id: int, chat_id: int, message_id: int | None) -> int:
    lang = await _user_lang(state, user_id)
    return await ui_show(
        bot=bot,
        chat_id=chat_id,
        message_id=message_id,
        text=texts.BUY_MENU_TEXT_RU if lang == "ru" else texts.BUY_MENU_TEXT_EN,
        reply_markup=kb.buy_menu_kb(is_admin=_is_admin(state, user_id), lang=lang),
    )


async def show_products(*, bot: Bot, state: State, user_id: int, chat_id: int, message_id: int | None) -> int:
    lang = await _user_lang(state, user_id)
    return await ui_show(
        bot=bot,
        chat_id=chat_id,
        message_id=message_id,
        text=texts.PRODUCTS_TEXT_RU if lang == "ru" else texts.PRODUCTS_TEXT_EN,
        reply_markup=kb.products_kb(lang=lang),
    )


async def show_language_menu(*, bot: Bot, state: State, user_id: int, chat_id: int, message_id: int | None) -> int:
    lang = await _user_lang(state, user_id)
    return await ui_show(
        bot=bot,
        chat_id=chat_id,
        message_id=message_id,
        text=texts.LANGUAGE_TEXT_RU if lang == "ru" else texts.LANGUAGE_TEXT_EN,
        reply_markup=kb.language_kb(lang=lang),
    )


async def show_subscription(*, bot: Bot, state: State, user_id: int, chat_id: int, message_id: int | None) -> int:
    lang = await _user_lang(state, user_id)
    sub = await state.db.get_subscription(user_id)
    if not sub:
        text = _t(lang, texts.NO_SUBSCRIPTION_TEXT, "No active subscription.")
        markup = kb.simple_back_kb(is_admin=_is_admin(state, user_id), lang=lang)
    else:
        left = sub["ends_at"] - utc_now()
        if lang == "ru":
            text = texts.SUBSCRIPTION_STATUS_TEMPLATE.format(
                plan_name=_plan_name(sub["plan_code"]),
                ends_at=_fmt_dt_local(sub["ends_at"], state.tz),
                left=_fmt_left(left),
            )
        else:
            text = (
                "My subscription:\n\n"
                f"Plan: {_plan_name(sub['plan_code'])}\n"
                f"Active until: {_fmt_dt_local(sub['ends_at'], state.tz)}\n"
                f"Time left: {_fmt_left(left)}\n"
            )
        markup = kb.renew_kb(is_admin=_is_admin(state, user_id), lang=lang)
    return await ui_show(bot=bot, chat_id=chat_id, message_id=message_id, text=text, reply_markup=markup)


async def show_admin_menu(*, bot: Bot, state: State, user_id: int, chat_id: int, message_id: int | None) -> int:
    lang = await _user_lang(state, user_id)
    if not _is_admin(state, user_id):
        return await ui_show(
            bot=bot,
            chat_id=chat_id,
            message_id=message_id,
            text=texts.ADMIN_ONLY,
            reply_markup=kb.simple_back_kb(is_admin=False, lang=lang),
        )
    return await ui_show(
        bot=bot,
        chat_id=chat_id,
        message_id=message_id,
        text="Админка.",
        reply_markup=kb.admin_menu_kb(),
    )


async def show_page(*, bot: Bot, state: State, user_id: int, chat_id: int, message_id: int | None, text: str) -> int:
    lang = await _user_lang(state, user_id)
    return await ui_show(
        bot=bot,
        chat_id=chat_id,
        message_id=message_id,
        text=text,
        reply_markup=kb.simple_back_kb(is_admin=_is_admin(state, user_id), lang=lang),
    )


async def show_nav_page(
    *,
    bot: Bot,
    state: State,
    user_id: int,
    chat_id: int,
    message_id: int | None,
    page: str,
) -> int | None:
    if page == "shop":
        return await show_shop(bot=bot, state=state, user_id=user_id, chat_id=chat_id, message_id=message_id)
    if page == "buy":
        return await show_buy_menu(bot=bot, state=state, user_id=user_id, chat_id=chat_id, message_id=message_id)
    if page == "products":
        return await show_products(bot=bot, state=state, user_id=user_id, chat_id=chat_id, message_id=message_id)
    if page == "sub":
        return await show_subscription(bot=bot, state=state, user_id=user_id, chat_id=chat_id, message_id=message_id)
    if page == "faq":
        return await show_page(
            bot=bot, state=state, user_id=user_id, chat_id=chat_id, message_id=message_id, text=texts.FAQ_TEXT
        )
    if page == "reviews":
        return await show_page(
            bot=bot, state=state, user_id=user_id, chat_id=chat_id, message_id=message_id, text=texts.REVIEWS_TEXT
        )
    if page in {"terms", "privacy"}:
        lang = await _user_lang(state, user_id)
        ptext = texts.PRIVACY_TEXT_RU if lang == "ru" else texts.PRIVACY_TEXT_EN
        return await show_page(
            bot=bot, state=state, user_id=user_id, chat_id=chat_id, message_id=message_id, text=ptext
        )
    if page == "support":
        return await show_page(
            bot=bot, state=state, user_id=user_id, chat_id=chat_id, message_id=message_id, text=texts.SUPPORT_TEXT
        )
    if page == "lang":
        return await show_language_menu(bot=bot, state=state, user_id=user_id, chat_id=chat_id, message_id=message_id)
    return None


async def reminders_loop(bot: Bot, state: State) -> None:
    while True:
        try:
            expiring = await state.db.list_expiring_subscriptions(
                within_days=state.settings.remind_before_days,
                limit=500,
            )
            for row in expiring:
                user_id = int(row["user_id"])
                ends_at: datetime = row["ends_at"]
                if await state.db.was_reminded(user_id, ends_at):
                    continue

                text = texts.REMIND_TEMPLATE.format(
                    plan_name=_plan_name(row["plan_code"]),
                    ends_at=_fmt_dt_local(ends_at, state.tz),
                )
                try:
                    lang = await _user_lang(state, user_id)
                    msg_id = state.menu_message_id.get(user_id)
                    new_id = await ui_show(
                        bot=bot,
                        chat_id=user_id,
                        message_id=msg_id,
                        text=text,
                        reply_markup=kb.renew_kb(is_admin=_is_admin(state, user_id), lang=lang),
                    )
                    state.menu_message_id[user_id] = new_id
                    await state.db.mark_reminded(user_id, ends_at)
                    await asyncio.sleep(0.05)
                except Exception:
                    log.exception("Failed to remind user_id=%s", user_id)
        except Exception:
            log.exception("reminders_loop tick failed")

        await asyncio.sleep(state.settings.remind_check_interval_sec)


async def cmd_start(message: Message, state: State) -> None:
    u = message.from_user
    await state.db.upsert_user(
        user_id=u.id,
        username=u.username,
        first_name=u.first_name,
        last_name=u.last_name,
    )

    # Remove legacy bottom keyboard once for user.
    if u.id not in state.reply_kb_removed_users:
        try:
            await message.answer(" ", reply_markup=ReplyKeyboardRemove())
            state.reply_kb_removed_users.add(u.id)
        except Exception:
            pass

    msg_id = state.menu_message_id.get(u.id)
    new_id = await show_shop(bot=message.bot, state=state, user_id=u.id, chat_id=message.chat.id, message_id=msg_id)
    state.menu_message_id[u.id] = new_id


async def cmd_admin(message: Message, state: State) -> None:
    u = message.from_user
    if _is_admin(state, u.id):
        _clear_admin_drafts(state, u.id)
    msg_id = state.menu_message_id.get(u.id)
    new_id = await show_admin_menu(bot=message.bot, state=state, user_id=u.id, chat_id=message.chat.id, message_id=msg_id)
    state.menu_message_id[u.id] = new_id


async def cmd_id(message: Message, state: State) -> None:
    await message.answer(f"Ваш Telegram ID: `{message.from_user.id}`", parse_mode="Markdown")


async def cmd_clear(message: Message, state: State) -> None:
    u = message.from_user
    user_id = u.id
    chat_id = message.chat.id

    old_menu_id = state.menu_message_id.pop(user_id, None)
    state.awaiting_payment_proof.pop(user_id, None)
    state.broadcast_draft.pop(user_id, None)
    state.grant_draft.pop(user_id, None)
    state.reply_kb_removed_users.discard(user_id)

    await state.db.clear_user_data(user_id)

    if old_menu_id:
        await _delete_message_safe(message.bot, chat_id, old_menu_id)
    await _delete_message_safe(message.bot, chat_id, message.message_id)

    await state.db.upsert_user(
        user_id=u.id,
        username=u.username,
        first_name=u.first_name,
        last_name=u.last_name,
    )

    try:
        tmp = await message.answer(" ", reply_markup=ReplyKeyboardRemove())
        await _delete_message_safe(message.bot, chat_id, tmp.message_id)
    except Exception:
        pass
    state.reply_kb_removed_users.add(user_id)

    new_id = await show_shop(
        bot=message.bot,
        state=state,
        user_id=user_id,
        chat_id=chat_id,
        message_id=None,
    )
    state.menu_message_id[user_id] = new_id


async def cb_nav(call: CallbackQuery, state: State) -> None:
    page = call.data.split(":", 1)[1]
    user_id = call.from_user.id
    chat_id = call.message.chat.id
    msg_id = call.message.message_id

    if _is_admin(state, user_id):
        _clear_admin_drafts(state, user_id)

    new_id = await show_nav_page(
        bot=call.bot,
        state=state,
        user_id=user_id,
        chat_id=chat_id,
        message_id=msg_id,
        page=page,
    )
    if new_id is None:
        await call.answer()
        return

    state.menu_message_id[user_id] = new_id
    await call.answer()


async def cb_buy(call: CallbackQuery, state: State) -> None:
    plan_code = call.data.split(":", 1)[1]
    if plan_code not in PLANS:
        await call.answer("Неизвестный тариф", show_alert=True)
        return

    user_id = call.from_user.id
    await state.db.upsert_user(
        user_id=user_id,
        username=call.from_user.username,
        first_name=call.from_user.first_name,
        last_name=call.from_user.last_name,
    )

    order_id = await state.db.create_order(user_id, plan_code)
    plan = PLANS[plan_code]
    created_at = _fmt_dt_local(utc_now(), state.tz)
    lang = await _user_lang(state, user_id)

    payment_link = (
        state.settings.lava_payment_url_template.format(order_id=order_id)
        if state.settings.lava_payment_url_template
        else _t(lang, "ссылка будет добавлена позже", "link will be added later")
    )

    if lang == "ru":
        text = texts.PAYMENT_INSTRUCTIONS_TEMPLATE.format(
            order_id=order_id,
            plan_name=plan.name,
            amount_rub=plan.price_rub,
            created_at=created_at,
            payment_link=payment_link,
        )
    else:
        text = (
            f"Order #{order_id}\n"
            f"Plan: {plan.name}\n"
            f"Amount: {plan.price_rub} ₽\n"
            f"Created: {created_at}\n\n"
            f"Payment (Lava): {payment_link}\n\n"
            "After payment tap \"I paid\"."
        )

    new_id = await ui_show(
        bot=call.bot,
        chat_id=call.message.chat.id,
        message_id=call.message.message_id,
        text=text,
        reply_markup=kb.order_kb(order_id, is_admin=_is_admin(state, user_id), lang=lang),
    )
    state.menu_message_id[user_id] = new_id
    await call.answer()


async def cb_paid(call: CallbackQuery, state: State) -> None:
    try:
        order_id = int(call.data.split(":", 1)[1])
    except ValueError:
        await call.answer("Некорректный заказ", show_alert=True)
        return

    user_id = call.from_user.id
    lang = await _user_lang(state, user_id)
    order = await state.db.get_order(order_id)
    if not order or int(order["user_id"]) != user_id:
        await call.answer(_t(lang, "Заказ не найден", "Order not found"), show_alert=True)
        return
    if order["status"] != "pending":
        await call.answer(_t(lang, "Заказ уже обработан", "Order already processed"), show_alert=True)
        return

    state.awaiting_payment_proof[user_id] = order_id
    new_id = await ui_show(
        bot=call.bot,
        chat_id=call.message.chat.id,
        message_id=call.message.message_id,
        text=_t(
            lang,
            texts.NEED_PAYMENT_PROOF,
            "Send payment reference/comment in one message so admin can verify your payment.",
        ),
        reply_markup=kb.proof_wait_kb(is_admin=_is_admin(state, user_id), lang=lang),
    )
    state.menu_message_id[user_id] = new_id
    await call.answer()


async def cb_lang_set(call: CallbackQuery, state: State) -> None:
    user_id = call.from_user.id
    parts = call.data.split(":")
    lang = parts[2] if len(parts) >= 3 else ""
    if lang not in {"ru", "en"}:
        await call.answer("Некорректный язык", show_alert=True)
        return

    await state.db.set_user_lang(user_id, lang)
    msg = texts.LANGUAGE_CHANGED_RU if lang == "ru" else texts.LANGUAGE_CHANGED_EN

    new_id = await ui_show(
        bot=call.bot,
        chat_id=call.message.chat.id,
        message_id=call.message.message_id,
        text=msg,
        reply_markup=kb.main_menu_kb(is_admin=_is_admin(state, user_id), lang=lang),
    )
    state.menu_message_id[user_id] = new_id
    await call.answer()


async def cb_admin_stats(call: CallbackQuery, state: State) -> None:
    if not _is_admin(state, call.from_user.id):
        await call.answer("Нет доступа", show_alert=True)
        return
    s = await state.db.stats_summary()
    text = (
        "Статистика:\n\n"
        f"Пользователей: {s['users']}\n"
        f"Заказов всего: {s['orders_total']}\n"
        f"Оплачено: {s['paid_count']}\n"
        f"Выручка: {s['revenue_rub']} ₽\n"
        f"Подписок (в базе): {s['subscriptions']}\n"
    )
    new_id = await ui_show(
        bot=call.bot,
        chat_id=call.message.chat.id,
        message_id=call.message.message_id,
        text=text,
        reply_markup=kb.admin_menu_kb(),
    )
    state.menu_message_id[call.from_user.id] = new_id
    await call.answer()


async def cb_admin_pending(call: CallbackQuery, state: State, *, do_answer: bool = True) -> None:
    if not _is_admin(state, call.from_user.id):
        await call.answer("Нет доступа", show_alert=True)
        return
    orders = await state.db.list_pending_orders(limit=10)
    if not orders:
        text = "Ожидающих заказов нет."
        markup = kb.admin_menu_kb()
    else:
        ids = [int(o["order_id"]) for o in orders]
        lines = ["Ожидают подтверждения (нажмите номер для карточки заказа):"]
        for o in orders:
            comment = (o.get("user_comment") or "-").strip()
            if len(comment) > 30:
                comment = f"{comment[:27]}..."
            lines.append(
                f"• #{o['order_id']} — {o['user_id']} — {_plan_name(o['plan_code'])} — {o['amount_rub']} ₽ — {comment}"
            )
        text = "\n".join(lines)
        markup = kb.admin_pending_list_kb(ids)

    new_id = await ui_show(
        bot=call.bot,
        chat_id=call.message.chat.id,
        message_id=call.message.message_id,
        text=text,
        reply_markup=markup,
    )
    state.menu_message_id[call.from_user.id] = new_id
    if do_answer:
        await call.answer()


async def cb_admin_expiring(call: CallbackQuery, state: State) -> None:
    if not _is_admin(state, call.from_user.id):
        await call.answer("Нет доступа", show_alert=True)
        return
    rows = await state.db.list_expiring_subscriptions(within_days=state.settings.remind_before_days, limit=50)
    if not rows:
        text = "Истекающих подписок (в ближайшие дни) нет."
    else:
        lines = ["Истекают скоро:"]
        for r in rows:
            lines.append(f"• {r['user_id']} — {_plan_name(r['plan_code'])} — до {_fmt_dt_local(r['ends_at'], state.tz)}")
        text = "\n".join(lines)
    new_id = await ui_show(
        bot=call.bot,
        chat_id=call.message.chat.id,
        message_id=call.message.message_id,
        text=text,
        reply_markup=kb.admin_menu_kb(),
    )
    state.menu_message_id[call.from_user.id] = new_id
    await call.answer()


async def cb_admin_view(call: CallbackQuery, state: State) -> None:
    if not _is_admin(state, call.from_user.id):
        await call.answer("Нет доступа", show_alert=True)
        return
    order_id = _safe_order_id(call.data)
    if order_id is None:
        await call.answer("Некорректный заказ", show_alert=True)
        return

    order = await state.db.get_order(order_id)
    if not order:
        await call.answer("Заказ не найден", show_alert=True)
        return

    if order["status"] == "pending":
        markup = kb.admin_order_kb(order_id, with_back=True)
    else:
        markup = kb.admin_back_to_pending_kb()

    new_id = await ui_show(
        bot=call.bot,
        chat_id=call.message.chat.id,
        message_id=call.message.message_id,
        text=_order_admin_text(order, state.tz),
        reply_markup=markup,
    )
    state.menu_message_id[call.from_user.id] = new_id
    await call.answer()


async def cb_admin_grant(call: CallbackQuery, state: State) -> None:
    if not _is_admin(state, call.from_user.id):
        await call.answer("Нет доступа", show_alert=True)
        return
    state.broadcast_draft.pop(call.from_user.id, None)
    state.grant_draft.pop(call.from_user.id, None)
    new_id = await ui_show(
        bot=call.bot,
        chat_id=call.message.chat.id,
        message_id=call.message.message_id,
        text="Ручная выдача подписки: выберите тариф.",
        reply_markup=kb.admin_grant_plan_kb(),
    )
    state.menu_message_id[call.from_user.id] = new_id
    await call.answer()


async def cb_admin_grant_plan(call: CallbackQuery, state: State) -> None:
    if not _is_admin(state, call.from_user.id):
        await call.answer("Нет доступа", show_alert=True)
        return
    plan_code = call.data.split(":", 2)[2]
    if plan_code not in PLANS:
        await call.answer("Неизвестный тариф", show_alert=True)
        return

    state.grant_draft[call.from_user.id] = {"step": "user_id", "plan_code": plan_code}
    state.broadcast_draft.pop(call.from_user.id, None)
    new_id = await ui_show(
        bot=call.bot,
        chat_id=call.message.chat.id,
        message_id=call.message.message_id,
        text=(
            f"Тариф: {_plan_name(plan_code)}.\n\n"
            "Отправьте Telegram user_id, которому нужно активировать подписку."
        ),
        reply_markup=kb.admin_grant_cancel_kb(),
    )
    state.menu_message_id[call.from_user.id] = new_id
    await call.answer()


async def cb_admin_grant_cancel(call: CallbackQuery, state: State) -> None:
    if _is_admin(state, call.from_user.id):
        state.grant_draft.pop(call.from_user.id, None)
    new_id = await show_admin_menu(
        bot=call.bot,
        state=state,
        user_id=call.from_user.id,
        chat_id=call.message.chat.id,
        message_id=call.message.message_id,
    )
    state.menu_message_id[call.from_user.id] = new_id
    await call.answer()


async def cb_admin_bcast(call: CallbackQuery, state: State) -> None:
    if not _is_admin(state, call.from_user.id):
        await call.answer("Нет доступа", show_alert=True)
        return
    state.grant_draft.pop(call.from_user.id, None)
    new_id = await ui_show(
        bot=call.bot,
        chat_id=call.message.chat.id,
        message_id=call.message.message_id,
        text="Рассылка: выберите аудиторию.",
        reply_markup=kb.admin_bcast_target_kb(),
    )
    state.menu_message_id[call.from_user.id] = new_id
    await call.answer()


async def cb_admin_bcast_target(call: CallbackQuery, state: State) -> None:
    if not _is_admin(state, call.from_user.id):
        await call.answer("Нет доступа", show_alert=True)
        return
    target = call.data.split(":", 2)[2]
    if target not in {"all", "active", "expiring"}:
        await call.answer("Некорректная аудитория", show_alert=True)
        return
    state.grant_draft.pop(call.from_user.id, None)
    state.broadcast_draft[call.from_user.id] = {"step": "text", "target": target}
    new_id = await ui_show(
        bot=call.bot,
        chat_id=call.message.chat.id,
        message_id=call.message.message_id,
        text="Пришлите текст рассылки одним сообщением.",
        reply_markup=kb.admin_bcast_cancel_kb(),
    )
    state.menu_message_id[call.from_user.id] = new_id
    await call.answer()


async def cb_admin_bcast_cancel(call: CallbackQuery, state: State) -> None:
    if not _is_admin(state, call.from_user.id):
        await call.answer("Нет доступа", show_alert=True)
        return
    state.broadcast_draft.pop(call.from_user.id, None)
    new_id = await show_admin_menu(
        bot=call.bot,
        state=state,
        user_id=call.from_user.id,
        chat_id=call.message.chat.id,
        message_id=call.message.message_id,
    )
    state.menu_message_id[call.from_user.id] = new_id
    await call.answer()


async def cb_admin_ok(call: CallbackQuery, state: State) -> None:
    if not _is_admin(state, call.from_user.id):
        await call.answer("Нет доступа", show_alert=True)
        return

    order_id = _safe_order_id(call.data)
    if order_id is None:
        await call.answer("Некорректный заказ", show_alert=True)
        return

    order = await state.db.get_order(order_id)
    if not order:
        await call.answer("Заказ не найден", show_alert=True)
        return
    if order["status"] == "paid":
        await call.answer("Заказ уже подтвержден", show_alert=True)
        return
    if order["status"] == "rejected":
        await call.answer("Заказ уже отклонен", show_alert=True)
        return

    await state.db.mark_order_paid(order_id)
    _, ends = await state.db.activate_subscription(int(order["user_id"]), order["plan_code"])

    await call.answer("Готово")
    # Notify buyer (separate message)
    try:
        await call.bot.send_message(
            int(order["user_id"]),
            "Оплата подтверждена.\n\n" f"Подписка активна до {_fmt_dt_local(ends, state.tz)}.",
        )
    except Exception:
        log.exception("Failed to notify buyer user_id=%s", order["user_id"])

    # Refresh admin UI back to pending list
    await cb_admin_pending(call, state, do_answer=False)


async def cb_admin_no(call: CallbackQuery, state: State) -> None:
    if not _is_admin(state, call.from_user.id):
        await call.answer("Нет доступа", show_alert=True)
        return

    order_id = _safe_order_id(call.data)
    if order_id is None:
        await call.answer("Некорректный заказ", show_alert=True)
        return

    order = await state.db.get_order(order_id)
    if not order:
        await call.answer("Заказ не найден", show_alert=True)
        return
    if order["status"] == "rejected":
        await call.answer("Заказ уже отклонен", show_alert=True)
        return
    if order["status"] == "paid":
        await call.answer("Заказ уже подтвержден", show_alert=True)
        return

    await state.db.mark_order_rejected(order_id)
    await call.answer("Отклонено")
    try:
        await call.bot.send_message(int(order["user_id"]), "Оплата не подтверждена. Свяжитесь с поддержкой.")
    except Exception:
        log.exception("Failed to notify buyer user_id=%s", order["user_id"])

    await cb_admin_pending(call, state, do_answer=False)


async def message_text_router(message: Message, state: State) -> None:
    user_id = message.from_user.id

    # Payment proof flow
    order_id = state.awaiting_payment_proof.get(user_id)
    if order_id:
        comment = (message.text or "").strip()
        if not comment:
            return
        lang = await _user_lang(state, user_id)
        await state.db.set_order_user_comment(order_id, comment[:1000])
        state.awaiting_payment_proof.pop(user_id, None)

        msg_id = state.menu_message_id.get(user_id)
        new_id = await ui_show(
            bot=message.bot,
            chat_id=message.chat.id,
            message_id=msg_id,
            text=texts.PAYMENT_PROOF_ACCEPTED,
            reply_markup=kb.simple_back_kb(is_admin=_is_admin(state, user_id), lang=lang),
        )
        state.menu_message_id[user_id] = new_id

        # Notify admins (separate message)
        order = await state.db.get_order(order_id)
        for admin_id in state.settings.admin_ids:
            try:
                await message.bot.send_message(
                    admin_id,
                    (
                        "Новый запрос подтверждения оплаты.\n\n"
                        f"Заказ #{order_id}\n"
                        f"User ID: {order['user_id']}\n"
                        f"Тариф: {_plan_name(order['plan_code'])}\n"
                        f"Сумма: {order['amount_rub']} ₽\n"
                        f"Комментарий: {order.get('user_comment') or '-'}\n"
                        f"Создан: {order['created_at']}\n"
                        "Проверьте заказ в веб-админке."
                    ),
                )
            except Exception:
                log.exception("Failed to notify admin_id=%s", admin_id)
        return

    # Manual grant flow (admin)
    grant = state.grant_draft.get(user_id)
    if grant and _is_admin(state, user_id) and grant.get("step") == "user_id":
        raw_user_id = (message.text or "").strip()
        try:
            target_user_id = int(raw_user_id)
        except ValueError:
            msg_id = state.menu_message_id.get(user_id)
            new_id = await ui_show(
                bot=message.bot,
                chat_id=message.chat.id,
                message_id=msg_id,
                text="Нужен числовой user_id. Отправьте только цифры, например: 123456789.",
                reply_markup=kb.admin_grant_cancel_kb(),
            )
            state.menu_message_id[user_id] = new_id
            return

        plan_code = grant["plan_code"]
        await state.db.upsert_user(target_user_id, None, None, None)
        _, ends = await state.db.activate_subscription(target_user_id, plan_code)
        state.grant_draft.pop(user_id, None)

        msg_id = state.menu_message_id.get(user_id)
        new_id = await ui_show(
            bot=message.bot,
            chat_id=message.chat.id,
            message_id=msg_id,
            text=(
                "Подписка выдана.\n\n"
                f"User ID: {target_user_id}\n"
                f"Тариф: {_plan_name(plan_code)}\n"
                f"Активна до: {_fmt_dt_local(ends, state.tz)}"
            ),
            reply_markup=kb.admin_menu_kb(),
        )
        state.menu_message_id[user_id] = new_id

        try:
            await message.bot.send_message(
                target_user_id,
                f"Администратор активировал подписку: {_plan_name(plan_code)}.\n"
                f"Действует до {_fmt_dt_local(ends, state.tz)}.",
            )
        except Exception:
            log.exception("Failed to notify granted user_id=%s", target_user_id)
        return

    # Broadcast flow (admin)
    draft = state.broadcast_draft.get(user_id)
    if draft and _is_admin(state, user_id) and draft.get("step") == "text":
        text = (message.text or "").strip()
        if not text:
            return
        target = draft["target"]

        if target == "all":
            user_ids = await state.db.list_users()
        elif target == "active":
            user_ids = await state.db.list_users(only_active=True)
        else:
            user_ids = await state.db.list_users(expiring_within_days=state.settings.remind_before_days)

        ok = 0
        fail = 0
        for uid in user_ids:
            try:
                await message.bot.send_message(uid, text)
                ok += 1
                await asyncio.sleep(0.05)
            except Exception:
                fail += 1

        state.broadcast_draft.pop(user_id, None)
        msg_id = state.menu_message_id.get(user_id)
        new_id = await ui_show(
            bot=message.bot,
            chat_id=message.chat.id,
            message_id=msg_id,
            text=f"Рассылка завершена. OK={ok}, FAIL={fail}",
            reply_markup=kb.admin_menu_kb(),
        )
        state.menu_message_id[user_id] = new_id
        return

    # Legacy bottom ReplyKeyboard (text buttons) support:
    # handle as navigation and clean up user message to avoid chat clutter.
    page = _legacy_text_to_page(message.text or "")

    if user_id not in state.reply_kb_removed_users:
        try:
            tmp = await message.answer(" ", reply_markup=ReplyKeyboardRemove())
            await _delete_message_safe(message.bot, message.chat.id, tmp.message_id)
            state.reply_kb_removed_users.add(user_id)
        except Exception:
            pass

    await _delete_message_safe(message.bot, message.chat.id, message.message_id)

    if page:
        msg_id = state.menu_message_id.get(user_id)
        new_id = await show_nav_page(
            bot=message.bot,
            state=state,
            user_id=user_id,
            chat_id=message.chat.id,
            message_id=msg_id,
            page=page,
        )
        if new_id is not None:
            state.menu_message_id[user_id] = new_id
            return

    # Fallback: any other text outside active flows -> show main menu.
    msg_id = state.menu_message_id.get(user_id)
    new_id = await show_shop(
        bot=message.bot,
        state=state,
        user_id=user_id,
        chat_id=message.chat.id,
        message_id=msg_id,
    )
    state.menu_message_id[user_id] = new_id


def build_dispatcher(state: State) -> Dispatcher:
    dp = Dispatcher()

    async def _cmd_start(m: Message) -> None:
        await cmd_start(m, state)

    async def _cmd_id(m: Message) -> None:
        await cmd_id(m, state)

    async def _cmd_clear(m: Message) -> None:
        await cmd_clear(m, state)

    async def _cb_nav(c: CallbackQuery) -> None:
        await cb_nav(c, state)

    async def _cb_buy(c: CallbackQuery) -> None:
        await cb_buy(c, state)

    async def _cb_paid(c: CallbackQuery) -> None:
        await cb_paid(c, state)

    async def _cb_lang_set(c: CallbackQuery) -> None:
        await cb_lang_set(c, state)

    async def _text_router(m: Message) -> None:
        await message_text_router(m, state)

    dp.message.register(_cmd_start, Command("start"))
    dp.message.register(_cmd_id, Command("id"))
    dp.message.register(_cmd_clear, Command("clear"))

    dp.callback_query.register(_cb_nav, F.data.startswith("nav:"))
    dp.callback_query.register(_cb_buy, F.data.startswith("buy:"))
    dp.callback_query.register(_cb_paid, F.data.startswith("paid:"))
    dp.callback_query.register(_cb_lang_set, F.data.startswith("lang:set:"))

    dp.message.register(_text_router, F.text)
    return dp


async def main() -> None:
    settings = load_settings()
    db = Database(settings.db_path)
    await db.init()

    try:
        tz = ZoneInfo(settings.timezone)
    except Exception:
        log.exception("Failed to load timezone '%s', falling back to UTC", settings.timezone)
        tz = ZoneInfo("UTC")

    state = State(
        settings=settings,
        db=db,
        tz=tz,
        menu_message_id={},
        awaiting_payment_proof={},
        broadcast_draft={},
        grant_draft={},
        reply_kb_removed_users=set(),
    )

    bot = Bot(token=settings.bot_token)
    dp = build_dispatcher(state)

    asyncio.create_task(reminders_loop(bot, state))
    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())
