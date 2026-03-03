import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv


def _load_env() -> None:
    """
    Try to load .env from the project directory (next to this file).
    This is more reliable than relying on current working directory.
    """
    dotenv_path = os.getenv("DOTENV_PATH", "").strip()
    if dotenv_path:
        load_dotenv(dotenv_path=dotenv_path, override=True)
        return

    here = Path(__file__).resolve().parent
    candidate = here / ".env"
    if candidate.exists():
        load_dotenv(dotenv_path=candidate, override=True)
    else:
        # Fallback: let python-dotenv try cwd discovery
        load_dotenv(override=True)


_load_env()


def _parse_admin_ids(raw: str) -> set[int]:
    raw = (raw or "").strip()
    if not raw:
        return set()
    out: set[int] = set()
    for part in raw.split(","):
        part = part.strip()
        if not part:
            continue
        # Accept only numeric IDs. Usernames like "@name" are ignored.
        try:
            out.add(int(part))
        except ValueError:
            continue
    return out


@dataclass(frozen=True)
class Settings:
    bot_token: str
    admin_ids: set[int]
    timezone: str

    # Reminders
    remind_before_days: int
    remind_check_interval_sec: int
    remind_send_time_local: str  # "HH:MM" local time

    # DB
    db_path: str

    # Lava placeholders (fill later)
    lava_payment_url_template: str  # e.g. "https://pay.example/{order_id}"
    lava_webhook_secret: str


def load_settings() -> Settings:
    bot_token = os.getenv("BOT_TOKEN", "").strip()
    if not bot_token:
        here = Path(__file__).resolve().parent
        env_path = here / ".env"
        hint = f"Set BOT_TOKEN in environment or in {env_path}"
        if env_path.exists():
            hint += f" (current size={env_path.stat().st_size} bytes)"
        raise RuntimeError(f"BOT_TOKEN is not set. {hint}")

    return Settings(
        bot_token=bot_token,
        admin_ids=_parse_admin_ids(os.getenv("ADMIN_IDS", "")),
        timezone=os.getenv("TZ", "Europe/Moscow"),
        remind_before_days=int(os.getenv("REMIND_BEFORE_DAYS", "1")),
        remind_check_interval_sec=int(os.getenv("REMIND_CHECK_INTERVAL_SEC", "600")),
        remind_send_time_local=os.getenv("REMIND_SEND_TIME_LOCAL", "12:00"),
        db_path=os.getenv("DB_PATH", "bot.db"),
        lava_payment_url_template=os.getenv("LAVA_PAYMENT_URL_TEMPLATE", ""),
        lava_webhook_secret=os.getenv("LAVA_WEBHOOK_SECRET", ""),
    )
