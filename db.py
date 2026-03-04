import aiosqlite
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone


UTC = timezone.utc


def utc_now() -> datetime:
    return datetime.now(tz=UTC)


def to_iso(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC).isoformat()


def from_iso(s: str) -> datetime:
    # Python parses ISO with offset via fromisoformat
    dt = datetime.fromisoformat(s)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC)


@dataclass(frozen=True)
class Plan:
    code: str
    name: str
    days: int
    price_rub: int


PLANS: dict[str, Plan] = {
    "month": Plan(code="month", name="1 месяц", days=30, price_rub=1499),
    "year": Plan(code="year", name="1 год", days=365, price_rub=14990),
}


class Database:
    def __init__(self, path: str):
        self.path = path

    async def init(self) -> None:
        async with aiosqlite.connect(self.path) as db:
            await db.execute("PRAGMA journal_mode=WAL;")
            await db.execute(
                """
                CREATE TABLE IF NOT EXISTS users (
                    user_id INTEGER PRIMARY KEY,
                    username TEXT,
                    first_name TEXT,
                    last_name TEXT,
                    created_at TEXT NOT NULL
                )
                """
            )
            await db.execute(
                """
                CREATE TABLE IF NOT EXISTS orders (
                    order_id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    plan_code TEXT NOT NULL,
                    amount_rub INTEGER NOT NULL,
                    status TEXT NOT NULL, -- pending|paid|rejected
                    user_comment TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )
            await db.execute(
                """
                CREATE TABLE IF NOT EXISTS subscriptions (
                    user_id INTEGER PRIMARY KEY,
                    plan_code TEXT NOT NULL,
                    starts_at TEXT NOT NULL,
                    ends_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )
            await db.execute(
                """
                CREATE TABLE IF NOT EXISTS remind_log (
                    user_id INTEGER NOT NULL,
                    ends_at TEXT NOT NULL,
                    sent_at TEXT NOT NULL,
                    PRIMARY KEY (user_id, ends_at)
                )
                """
            )
            await db.execute(
                """
                CREATE TABLE IF NOT EXISTS broadcasts (
                    broadcast_id INTEGER PRIMARY KEY AUTOINCREMENT,
                    created_at TEXT NOT NULL,
                    created_by INTEGER NOT NULL,
                    text TEXT NOT NULL,
                    target TEXT NOT NULL, -- all|active|expiring
                    status TEXT NOT NULL, -- draft|sent
                    sent_at TEXT,
                    ok_count INTEGER NOT NULL DEFAULT 0,
                    fail_count INTEGER NOT NULL DEFAULT 0
                )
                """
            )
            await db.execute(
                """
                CREATE TABLE IF NOT EXISTS user_settings (
                    user_id INTEGER PRIMARY KEY,
                    lang TEXT NOT NULL DEFAULT 'ru',
                    updated_at TEXT NOT NULL
                )
                """
            )
            await db.commit()

    async def upsert_user(self, user_id: int, username: str | None, first_name: str | None, last_name: str | None) -> None:
        now = to_iso(utc_now())
        async with aiosqlite.connect(self.path) as db:
            await db.execute(
                """
                INSERT INTO users(user_id, username, first_name, last_name, created_at)
                VALUES(?,?,?,?,?)
                ON CONFLICT(user_id) DO UPDATE SET
                    username=excluded.username,
                    first_name=excluded.first_name,
                    last_name=excluded.last_name
                """,
                (user_id, username, first_name, last_name, now),
            )
            await db.commit()

    async def create_order(self, user_id: int, plan_code: str) -> int:
        plan = PLANS[plan_code]
        now = to_iso(utc_now())
        async with aiosqlite.connect(self.path) as db:
            cur = await db.execute(
                """
                INSERT INTO orders(user_id, plan_code, amount_rub, status, created_at, updated_at)
                VALUES(?,?,?,?,?,?)
                """,
                (user_id, plan_code, plan.price_rub, "pending", now, now),
            )
            await db.commit()
            return int(cur.lastrowid)

    async def set_order_user_comment(self, order_id: int, comment: str) -> None:
        now = to_iso(utc_now())
        async with aiosqlite.connect(self.path) as db:
            await db.execute(
                "UPDATE orders SET user_comment=?, updated_at=? WHERE order_id=?",
                (comment, now, order_id),
            )
            await db.commit()

    async def get_order(self, order_id: int) -> dict | None:
        async with aiosqlite.connect(self.path) as db:
            db.row_factory = aiosqlite.Row
            cur = await db.execute("SELECT * FROM orders WHERE order_id=?", (order_id,))
            row = await cur.fetchone()
            return dict(row) if row else None

    async def list_pending_orders(self, limit: int = 50) -> list[dict]:
        async with aiosqlite.connect(self.path) as db:
            db.row_factory = aiosqlite.Row
            cur = await db.execute(
                "SELECT * FROM orders WHERE status='pending' ORDER BY created_at DESC LIMIT ?",
                (limit,),
            )
            rows = await cur.fetchall()
            return [dict(r) for r in rows]

    async def list_orders(self, status: str | None = None, limit: int = 100) -> list[dict]:
        async with aiosqlite.connect(self.path) as db:
            db.row_factory = aiosqlite.Row
            if status:
                cur = await db.execute(
                    "SELECT * FROM orders WHERE status=? ORDER BY created_at DESC LIMIT ?",
                    (status, limit),
                )
            else:
                cur = await db.execute(
                    "SELECT * FROM orders ORDER BY created_at DESC LIMIT ?",
                    (limit,),
                )
            rows = await cur.fetchall()
            return [dict(r) for r in rows]

    async def mark_order_paid(self, order_id: int) -> dict | None:
        now = to_iso(utc_now())
        async with aiosqlite.connect(self.path) as db:
            await db.execute(
                "UPDATE orders SET status='paid', updated_at=? WHERE order_id=? AND status='pending'",
                (now, order_id),
            )
            await db.commit()
        return await self.get_order(order_id)

    async def mark_order_rejected(self, order_id: int) -> dict | None:
        now = to_iso(utc_now())
        async with aiosqlite.connect(self.path) as db:
            await db.execute(
                "UPDATE orders SET status='rejected', updated_at=? WHERE order_id=? AND status='pending'",
                (now, order_id),
            )
            await db.commit()
        return await self.get_order(order_id)

    async def activate_subscription(self, user_id: int, plan_code: str) -> tuple[datetime, datetime]:
        plan = PLANS[plan_code]
        now = utc_now()

        current = await self.get_subscription(user_id)
        if current and current["ends_at"] > now:
            starts = current["starts_at"]
            ends = current["ends_at"] + timedelta(days=plan.days)
        else:
            starts = now
            ends = now + timedelta(days=plan.days)

        async with aiosqlite.connect(self.path) as db:
            await db.execute(
                """
                INSERT INTO subscriptions(user_id, plan_code, starts_at, ends_at, updated_at)
                VALUES(?,?,?,?,?)
                ON CONFLICT(user_id) DO UPDATE SET
                    plan_code=excluded.plan_code,
                    starts_at=excluded.starts_at,
                    ends_at=excluded.ends_at,
                    updated_at=excluded.updated_at
                """,
                (user_id, plan_code, to_iso(starts), to_iso(ends), to_iso(now)),
            )
            await db.commit()
        return starts, ends

    async def get_subscription(self, user_id: int) -> dict | None:
        async with aiosqlite.connect(self.path) as db:
            db.row_factory = aiosqlite.Row
            cur = await db.execute("SELECT * FROM subscriptions WHERE user_id=?", (user_id,))
            row = await cur.fetchone()
            if not row:
                return None
            d = dict(row)
            d["starts_at"] = from_iso(d["starts_at"])
            d["ends_at"] = from_iso(d["ends_at"])
            d["updated_at"] = from_iso(d["updated_at"])
            return d

    async def list_expiring_subscriptions(self, within_days: int, limit: int = 50) -> list[dict]:
        now = utc_now()
        until = now + timedelta(days=within_days)
        async with aiosqlite.connect(self.path) as db:
            db.row_factory = aiosqlite.Row
            cur = await db.execute(
                """
                SELECT s.user_id, s.plan_code, s.ends_at
                FROM subscriptions s
                WHERE s.ends_at > ? AND s.ends_at <= ?
                ORDER BY s.ends_at ASC
                LIMIT ?
                """,
                (to_iso(now), to_iso(until), limit),
            )
            rows = await cur.fetchall()
            out: list[dict] = []
            for r in rows:
                d = dict(r)
                d["ends_at"] = from_iso(d["ends_at"])
                out.append(d)
            return out

    async def was_reminded(self, user_id: int, ends_at: datetime) -> bool:
        async with aiosqlite.connect(self.path) as db:
            cur = await db.execute(
                "SELECT 1 FROM remind_log WHERE user_id=? AND ends_at=?",
                (user_id, to_iso(ends_at)),
            )
            row = await cur.fetchone()
            return row is not None

    async def mark_reminded(self, user_id: int, ends_at: datetime) -> None:
        async with aiosqlite.connect(self.path) as db:
            await db.execute(
                "INSERT OR IGNORE INTO remind_log(user_id, ends_at, sent_at) VALUES(?,?,?)",
                (user_id, to_iso(ends_at), to_iso(utc_now())),
            )
            await db.commit()

    async def stats_summary(self) -> dict:
        async with aiosqlite.connect(self.path) as db:
            cur = await db.execute("SELECT COUNT(*) FROM users")
            users = (await cur.fetchone())[0]

            cur = await db.execute("SELECT COUNT(*) FROM orders")
            orders_total = (await cur.fetchone())[0]

            cur = await db.execute("SELECT COUNT(*), COALESCE(SUM(amount_rub),0) FROM orders WHERE status='paid'")
            paid_count, revenue = await cur.fetchone()

            cur = await db.execute("SELECT COUNT(*) FROM subscriptions")
            subs = (await cur.fetchone())[0]

        return {
            "users": int(users),
            "orders_total": int(orders_total),
            "paid_count": int(paid_count),
            "revenue_rub": int(revenue),
            "subscriptions": int(subs),
        }

    async def list_users(self, only_active: bool | None = None, expiring_within_days: int | None = None) -> list[int]:
        async with aiosqlite.connect(self.path) as db:
            if expiring_within_days is not None:
                now = utc_now()
                until = now + timedelta(days=expiring_within_days)
                cur = await db.execute(
                    """
                    SELECT user_id FROM subscriptions
                    WHERE ends_at > ? AND ends_at <= ?
                    """,
                    (to_iso(now), to_iso(until)),
                )
                return [int(r[0]) for r in await cur.fetchall()]

            if only_active is True:
                cur = await db.execute(
                    "SELECT user_id FROM subscriptions WHERE ends_at > ?",
                    (to_iso(utc_now()),),
                )
                return [int(r[0]) for r in await cur.fetchall()]

            cur = await db.execute("SELECT user_id FROM users")
            return [int(r[0]) for r in await cur.fetchall()]

    async def get_user_lang(self, user_id: int) -> str:
        async with aiosqlite.connect(self.path) as db:
            cur = await db.execute("SELECT lang FROM user_settings WHERE user_id=?", (user_id,))
            row = await cur.fetchone()
            if not row:
                return "ru"
            lang = (row[0] or "ru").strip().lower()
            return lang if lang in {"ru", "en"} else "ru"

    async def set_user_lang(self, user_id: int, lang: str) -> None:
        lang = (lang or "ru").strip().lower()
        if lang not in {"ru", "en"}:
            lang = "ru"
        now = to_iso(utc_now())
        async with aiosqlite.connect(self.path) as db:
            await db.execute(
                """
                INSERT INTO user_settings(user_id, lang, updated_at)
                VALUES(?,?,?)
                ON CONFLICT(user_id) DO UPDATE SET
                    lang=excluded.lang,
                    updated_at=excluded.updated_at
                """,
                (user_id, lang, now),
            )
            await db.commit()

    async def create_broadcast(self, created_by: int, text: str, target: str) -> int:
        now = to_iso(utc_now())
        async with aiosqlite.connect(self.path) as db:
            cur = await db.execute(
                """
                INSERT INTO broadcasts(created_at, created_by, text, target, status)
                VALUES(?,?,?,?,?)
                """,
                (now, created_by, text, target, "draft"),
            )
            await db.commit()
            return int(cur.lastrowid)

    async def finish_broadcast(self, broadcast_id: int, ok_count: int, fail_count: int) -> None:
        now = to_iso(utc_now())
        async with aiosqlite.connect(self.path) as db:
            await db.execute(
                """
                UPDATE broadcasts
                SET status='sent', sent_at=?, ok_count=?, fail_count=?
                WHERE broadcast_id=?
                """,
                (now, int(ok_count), int(fail_count), int(broadcast_id)),
            )
            await db.commit()

    async def list_broadcasts(self, limit: int = 20) -> list[dict]:
        async with aiosqlite.connect(self.path) as db:
            db.row_factory = aiosqlite.Row
            cur = await db.execute(
                """
                SELECT * FROM broadcasts
                ORDER BY created_at DESC
                LIMIT ?
                """,
                (limit,),
            )
            rows = await cur.fetchall()
            return [dict(r) for r in rows]

    async def clear_user_data(self, user_id: int, *, keep_profile: bool = False) -> None:
        async with aiosqlite.connect(self.path) as db:
            await db.execute("DELETE FROM remind_log WHERE user_id=?", (user_id,))
            await db.execute("DELETE FROM user_settings WHERE user_id=?", (user_id,))
            await db.execute("DELETE FROM subscriptions WHERE user_id=?", (user_id,))
            await db.execute("DELETE FROM orders WHERE user_id=?", (user_id,))
            if not keep_profile:
                await db.execute("DELETE FROM users WHERE user_id=?", (user_id,))
            await db.commit()
