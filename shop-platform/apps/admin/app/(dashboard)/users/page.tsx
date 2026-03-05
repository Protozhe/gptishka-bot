"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

interface UserRow {
  id: string;
  telegramId: string;
  username?: string;
  locale: "ru" | "en";
  ordersCount: number;
  totalSpent: number;
  isBlocked: boolean;
}

export default function UsersPage() {
  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{ items: UserRow[] }>("/v1/admin/users?page=1&pageSize=100");
      setRows(data.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить пользователей");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>Пользователи</h3>
        <button className="btn btn-secondary" onClick={load}>{loading ? "Загрузка..." : "Обновить"}</button>
      </div>
      {error ? (
        <div style={{ marginBottom: 12, color: "#fecaca", border: "1px solid rgba(239,68,68,.4)", borderRadius: 10, padding: 10 }}>
          {error}
        </div>
      ) : null}
      {success ? (
        <div style={{ marginBottom: 12, color: "#bbf7d0", border: "1px solid rgba(34,197,94,.4)", borderRadius: 10, padding: 10 }}>
          {success}
        </div>
      ) : null}
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Telegram ID</th><th>Ник</th><th>Язык</th><th>Заказы</th><th>Потрачено</th><th>Статус</th><th>Действие</th></tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.telegramId}</td>
                <td>{row.username || "-"}</td>
                <td>{row.locale}</td>
                <td>{row.ordersCount}</td>
                <td>{row.totalSpent} руб.</td>
                <td>{row.isBlocked ? "Заблокирован" : "Активен"}</td>
                <td>
                  <button className="btn btn-secondary" onClick={async () => {
                    setError(null);
                    setSuccess(null);
                    try {
                      await apiFetch(`/v1/admin/users/${row.id}`, { method: "PATCH", body: JSON.stringify({ isBlocked: !row.isBlocked }) });
                      setSuccess(row.isBlocked ? "Пользователь разблокирован." : "Пользователь заблокирован.");
                      await load();
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "Не удалось изменить статус пользователя");
                    }
                  }}>{row.isBlocked ? "Разблокировать" : "Заблокировать"}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
