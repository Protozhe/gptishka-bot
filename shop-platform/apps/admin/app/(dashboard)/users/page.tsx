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

  const load = async () => {
    setLoading(true);
    const data = await apiFetch<{ items: UserRow[] }>("/v1/admin/users?page=1&pageSize=100");
    setRows(data.items);
    setLoading(false);
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
                    await apiFetch(`/v1/admin/users/${row.id}`, { method: "PATCH", body: JSON.stringify({ isBlocked: !row.isBlocked }) });
                    await load();
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
