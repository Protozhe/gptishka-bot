#!/usr/bin/env python3
import argparse
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path


UTC = timezone.utc


def utc_now_iso() -> str:
    return datetime.now(tz=UTC).isoformat()


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description="Cleanup pending orders: optionally reject stale pending orders and clear comments."
    )
    p.add_argument("--db", default="bot.db", help="Path to SQLite DB (default: bot.db)")
    p.add_argument(
        "--older-than-hours",
        type=float,
        default=0.0,
        help="Reject only pending orders older than this number of hours. 0 means all pending orders.",
    )
    p.add_argument(
        "--clear-comments",
        action="store_true",
        help="Also clear user_comment for affected orders.",
    )
    p.add_argument("--dry-run", action="store_true", help="Preview only, do not write changes.")
    return p


def main() -> int:
    args = build_parser().parse_args()
    db_path = Path(args.db)
    if not db_path.exists():
        print(f"DB not found: {db_path}")
        return 1

    where = "status='pending'"
    params: list[str] = []

    if args.older_than_hours > 0:
        cutoff = datetime.now(tz=UTC) - timedelta(hours=args.older_than_hours)
        where += " AND created_at <= ?"
        params.append(cutoff.isoformat())

    with sqlite3.connect(str(db_path)) as conn:
        conn.row_factory = sqlite3.Row
        cur = conn.execute(
            f"""
            SELECT order_id, user_id, plan_code, amount_rub, status, created_at
            FROM orders
            WHERE {where}
            ORDER BY created_at ASC
            """,
            params,
        )
        rows = cur.fetchall()
        print(f"Matched pending orders: {len(rows)}")
        for r in rows[:20]:
            print(
                f"  #{r['order_id']} user={r['user_id']} plan={r['plan_code']} amount={r['amount_rub']} created={r['created_at']}"
            )
        if len(rows) > 20:
            print(f"  ... and {len(rows) - 20} more")

        if args.dry_run or not rows:
            print("Dry run: no changes applied." if args.dry_run else "Nothing to update.")
            return 0

        order_ids = [int(r["order_id"]) for r in rows]
        placeholders = ",".join(["?"] * len(order_ids))
        now = utc_now_iso()

        conn.execute(
            f"UPDATE orders SET status='rejected', updated_at=? WHERE order_id IN ({placeholders})",
            [now, *order_ids],
        )

        if args.clear_comments:
            conn.execute(
                f"UPDATE orders SET user_comment=NULL WHERE order_id IN ({placeholders})",
                order_ids,
            )

        conn.commit()

    print(f"Updated orders: {len(rows)} (status -> rejected)")
    if args.clear_comments:
        print("Comments cleared for affected orders.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
