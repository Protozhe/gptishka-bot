import asyncio
import logging
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from aiogram import Bot
from fastapi import FastAPI, Form, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from starlette.middleware.sessions import SessionMiddleware
from starlette.responses import Response

from config import Settings, load_settings
from db import Database, PLANS, from_iso


log = logging.getLogger("admin_web")
logging.basicConfig(level=logging.INFO)

settings: Settings = load_settings()
db = Database(settings.db_path)
bot = Bot(token=settings.bot_token)

try:
    TZ = ZoneInfo(settings.timezone)
except Exception:
    TZ = ZoneInfo("UTC")

templates = Jinja2Templates(directory=str(Path(__file__).resolve().parent / "templates"))
app = FastAPI(title="GPTishka Admin")
app.add_middleware(
    SessionMiddleware,
    secret_key=settings.admin_web_secret or f"gptishka-{settings.bot_token[-16:]}",
    same_site="lax",
)


def _is_auth(request: Request) -> bool:
    return bool(request.session.get("admin_ok"))


def _require_auth(request: Request) -> RedirectResponse | None:
    if _is_auth(request):
        return None
    return RedirectResponse(url="/login", status_code=303)


def _flash(request: Request, message: str, kind: str = "info") -> None:
    request.session["flash"] = {"message": message, "kind": kind}


def _pull_flash(request: Request) -> dict | None:
    flash = request.session.get("flash")
    if flash:
        request.session.pop("flash", None)
    return flash


def _fmt_dt(raw: str | None) -> str:
    if not raw:
        return "-"
    try:
        return from_iso(raw).astimezone(TZ).strftime("%Y-%m-%d %H:%M")
    except Exception:
        return str(raw)


def _status_label(status: str) -> str:
    return {
        "pending": "Ожидает",
        "paid": "Оплачен",
        "rejected": "Отклонен",
    }.get(status, status)


def _plan_name(code: str) -> str:
    plan = PLANS.get(code)
    return plan.name if plan else code


def _base_ctx(request: Request, **kwargs) -> dict:
    return {
        "request": request,
        "flash": _pull_flash(request),
        "login": settings.admin_web_login,
        **kwargs,
    }


@app.on_event("startup")
async def on_startup() -> None:
    await db.init()
    if not settings.admin_web_password:
        log.warning("ADMIN_WEB_PASSWORD is empty. Set it in .env to protect the panel.")


@app.get("/login", response_class=HTMLResponse)
async def login_page(request: Request) -> Response:
    if _is_auth(request):
        return RedirectResponse(url="/", status_code=303)
    return templates.TemplateResponse("login.html", _base_ctx(request))


@app.post("/login")
async def login_submit(
    request: Request,
    login: str = Form(""),
    password: str = Form(""),
) -> RedirectResponse:
    if login == settings.admin_web_login and password == settings.admin_web_password and settings.admin_web_password:
        request.session["admin_ok"] = True
        return RedirectResponse(url="/", status_code=303)
    _flash(request, "Неверный логин или пароль.", "danger")
    return RedirectResponse(url="/login", status_code=303)


@app.post("/logout")
async def logout(request: Request) -> RedirectResponse:
    request.session.clear()
    return RedirectResponse(url="/login", status_code=303)


@app.get("/", response_class=HTMLResponse)
async def dashboard(request: Request) -> Response:
    guard = _require_auth(request)
    if guard:
        return guard

    stats = await db.stats_summary()
    pending = await db.list_pending_orders(limit=200)
    expiring = await db.list_expiring_subscriptions(within_days=settings.remind_before_days, limit=200)
    broadcasts = await db.list_broadcasts(limit=10)

    for b in broadcasts:
        b["created_at_local"] = _fmt_dt(b.get("created_at"))
        b["sent_at_local"] = _fmt_dt(b.get("sent_at"))

    return templates.TemplateResponse(
        "dashboard.html",
        _base_ctx(
            request,
            stats=stats,
            pending_count=len(pending),
            expiring_count=len(expiring),
            broadcasts=broadcasts,
        ),
    )


@app.get("/orders", response_class=HTMLResponse)
async def orders_page(request: Request, status: str = "pending") -> Response:
    guard = _require_auth(request)
    if guard:
        return guard

    status = status if status in {"all", "pending", "paid", "rejected"} else "pending"
    rows = await db.list_orders(None if status == "all" else status, limit=200)
    for row in rows:
        row["plan_name"] = _plan_name(row["plan_code"])
        row["status_label"] = _status_label(row["status"])
        row["created_local"] = _fmt_dt(row.get("created_at"))
        row["updated_local"] = _fmt_dt(row.get("updated_at"))
        comment = (row.get("user_comment") or "").strip()
        row["comment_short"] = comment if len(comment) <= 45 else f"{comment[:42]}..."

    return templates.TemplateResponse(
        "orders.html",
        _base_ctx(request, rows=rows, current_status=status),
    )


@app.get("/orders/{order_id}", response_class=HTMLResponse)
async def order_detail(request: Request, order_id: int) -> Response:
    guard = _require_auth(request)
    if guard:
        return guard

    order = await db.get_order(order_id)
    if not order:
        _flash(request, "Заказ не найден.", "warning")
        return RedirectResponse(url="/orders", status_code=303)

    order["plan_name"] = _plan_name(order["plan_code"])
    order["status_label"] = _status_label(order["status"])
    order["created_local"] = _fmt_dt(order.get("created_at"))
    order["updated_local"] = _fmt_dt(order.get("updated_at"))

    return templates.TemplateResponse("order_detail.html", _base_ctx(request, order=order))


@app.post("/orders/{order_id}/approve")
async def order_approve(request: Request, order_id: int) -> RedirectResponse:
    guard = _require_auth(request)
    if guard:
        return guard

    order = await db.get_order(order_id)
    if not order:
        _flash(request, "Заказ не найден.", "warning")
        return RedirectResponse(url="/orders", status_code=303)
    if order["status"] != "pending":
        _flash(request, "Заказ уже обработан.", "warning")
        return RedirectResponse(url=f"/orders/{order_id}", status_code=303)

    await db.mark_order_paid(order_id)
    _, ends = await db.activate_subscription(int(order["user_id"]), order["plan_code"])

    try:
        await bot.send_message(
            int(order["user_id"]),
            f"Оплата подтверждена.\n\nПодписка активна до {ends.astimezone(TZ).strftime('%Y-%m-%d %H:%M')}.",
        )
    except Exception:
        log.exception("Failed to notify user_id=%s about paid order=%s", order["user_id"], order_id)

    _flash(request, f"Заказ #{order_id} подтвержден.", "success")
    return RedirectResponse(url=f"/orders/{order_id}", status_code=303)


@app.post("/orders/{order_id}/reject")
async def order_reject(request: Request, order_id: int) -> RedirectResponse:
    guard = _require_auth(request)
    if guard:
        return guard

    order = await db.get_order(order_id)
    if not order:
        _flash(request, "Заказ не найден.", "warning")
        return RedirectResponse(url="/orders", status_code=303)
    if order["status"] != "pending":
        _flash(request, "Заказ уже обработан.", "warning")
        return RedirectResponse(url=f"/orders/{order_id}", status_code=303)

    await db.mark_order_rejected(order_id)
    try:
        await bot.send_message(int(order["user_id"]), "Оплата не подтверждена. Свяжитесь с поддержкой.")
    except Exception:
        log.exception("Failed to notify user_id=%s about rejected order=%s", order["user_id"], order_id)

    _flash(request, f"Заказ #{order_id} отклонен.", "success")
    return RedirectResponse(url=f"/orders/{order_id}", status_code=303)


@app.get("/expiring", response_class=HTMLResponse)
async def expiring_page(request: Request) -> Response:
    guard = _require_auth(request)
    if guard:
        return guard

    rows = await db.list_expiring_subscriptions(within_days=settings.remind_before_days, limit=300)
    for row in rows:
        row["plan_name"] = _plan_name(row["plan_code"])
        row["ends_local"] = row["ends_at"].astimezone(TZ).strftime("%Y-%m-%d %H:%M")

    return templates.TemplateResponse("expiring.html", _base_ctx(request, rows=rows))


@app.get("/broadcast", response_class=HTMLResponse)
async def broadcast_page(request: Request) -> Response:
    guard = _require_auth(request)
    if guard:
        return guard

    logs = await db.list_broadcasts(limit=20)
    for row in logs:
        row["created_at_local"] = _fmt_dt(row.get("created_at"))
        row["sent_at_local"] = _fmt_dt(row.get("sent_at"))
    return templates.TemplateResponse("broadcast.html", _base_ctx(request, logs=logs))


@app.post("/broadcast")
async def broadcast_send(
    request: Request,
    target: str = Form("all"),
    text: str = Form(""),
) -> RedirectResponse:
    guard = _require_auth(request)
    if guard:
        return guard

    target = target if target in {"all", "active", "expiring"} else "all"
    text = (text or "").strip()
    if not text:
        _flash(request, "Текст рассылки пустой.", "warning")
        return RedirectResponse(url="/broadcast", status_code=303)

    if target == "all":
        user_ids = await db.list_users()
    elif target == "active":
        user_ids = await db.list_users(only_active=True)
    else:
        user_ids = await db.list_users(expiring_within_days=settings.remind_before_days)

    created_by = min(settings.admin_ids) if settings.admin_ids else 0
    bcast_id = await db.create_broadcast(created_by=created_by, text=text, target=target)

    ok = 0
    fail = 0
    for user_id in user_ids:
        try:
            await bot.send_message(int(user_id), text)
            ok += 1
            await asyncio.sleep(0.03)
        except Exception:
            fail += 1

    await db.finish_broadcast(bcast_id, ok_count=ok, fail_count=fail)
    _flash(request, f"Рассылка отправлена. OK={ok}, FAIL={fail}", "success")
    return RedirectResponse(url="/broadcast", status_code=303)


@app.get("/grant", response_class=HTMLResponse)
async def grant_page(request: Request) -> Response:
    guard = _require_auth(request)
    if guard:
        return guard
    return templates.TemplateResponse("grant.html", _base_ctx(request, plans=PLANS))


@app.post("/grant")
async def grant_submit(
    request: Request,
    user_id: str = Form(""),
    plan_code: str = Form("month"),
) -> RedirectResponse:
    guard = _require_auth(request)
    if guard:
        return guard

    plan_code = plan_code if plan_code in PLANS else "month"
    try:
        uid = int((user_id or "").strip())
    except ValueError:
        _flash(request, "User ID должен быть числом.", "warning")
        return RedirectResponse(url="/grant", status_code=303)

    await db.upsert_user(uid, None, None, None)
    _, ends = await db.activate_subscription(uid, plan_code)
    try:
        await bot.send_message(
            uid,
            f"Администратор активировал подписку: {_plan_name(plan_code)}.\n"
            f"Действует до {ends.astimezone(TZ).strftime('%Y-%m-%d %H:%M')}.",
        )
    except Exception:
        log.exception("Failed to notify granted user_id=%s", uid)

    _flash(
        request,
        f"Подписка выдана пользователю {uid} до {ends.astimezone(TZ).strftime('%Y-%m-%d %H:%M')}.",
        "success",
    )
    return RedirectResponse(url="/grant", status_code=303)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "admin_web:app",
        host=settings.admin_web_host,
        port=settings.admin_web_port,
        reload=False,
    )
