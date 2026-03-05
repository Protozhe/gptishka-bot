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
        <h3 style={{ margin: 0 }}>Users</h3>
        <button className="btn btn-secondary" onClick={load}>{loading ? "Loading..." : "Refresh"}</button>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Telegram ID</th><th>Username</th><th>Lang</th><th>Orders</th><th>Spent</th><th>Status</th><th>Action</th></tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.telegramId}</td>
                <td>{row.username || "-"}</td>
                <td>{row.locale}</td>
                <td>{row.ordersCount}</td>
                <td>{row.totalSpent} ₽</td>
                <td>{row.isBlocked ? "Blocked" : "Active"}</td>
                <td>
                  <button className="btn btn-secondary" onClick={async () => {
                    await apiFetch(`/v1/admin/users/${row.id}`, { method: "PATCH", body: JSON.stringify({ isBlocked: !row.isBlocked }) });
                    await load();
                  }}>{row.isBlocked ? "Unblock" : "Block"}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
