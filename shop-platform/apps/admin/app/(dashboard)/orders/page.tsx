"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

interface Order {
  id: string;
  orderNumber: number;
  status: string;
  amountRub: number;
  user: { telegramId: string };
  product: { titleRu: string };
  createdAt: string;
}

const statuses = ["created", "pending_payment", "paid", "issued", "processing", "canceled", "error", "refund"];

const statusLabels: Record<string, string> = {
  created: "Создан",
  pending_payment: "Ожидает оплату",
  paid: "Оплачен",
  issued: "Выдан",
  processing: "В обработке",
  canceled: "Отменен",
  error: "Ошибка",
  refund: "Возврат/спор"
};

export default function OrdersPage() {
  const [rows, setRows] = useState<Order[]>([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const q = statusFilter !== "all" ? `?status=${statusFilter}` : "";
      const data = await apiFetch<{ items: Order[] }>(`/v1/admin/orders${q}`);
      setRows(data.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить заказы");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [statusFilter]);

  return (
    <div className="card">
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <select className="select" style={{ width: 220 }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">Все статусы</option>
          {statuses.map((status) => <option key={status} value={status}>{statusLabels[status] || status}</option>)}
        </select>
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
          <thead><tr><th>#</th><th>Пользователь</th><th>Товар</th><th>Сумма</th><th>Статус</th><th>Дата</th><th>Действие</th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.orderNumber}</td><td>{row.user.telegramId}</td><td>{row.product.titleRu}</td><td>{row.amountRub} руб.</td><td>{statusLabels[row.status] || row.status}</td><td>{new Date(row.createdAt).toLocaleString()}</td>
                <td style={{ display: "flex", gap: 8 }}>
                  <button className="btn btn-secondary" onClick={async () => {
                    setError(null);
                    setSuccess(null);
                    try {
                      await apiFetch(`/v1/admin/orders/${row.id}/status`, { method: "PATCH", body: JSON.stringify({ status: "processing" }) });
                      setSuccess(`Заказ #${row.orderNumber} переведен в обработку.`);
                      await load();
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "Не удалось изменить статус заказа");
                    }
                  }}>В обработку</button>
                  <button className="btn btn-primary" onClick={async () => {
                    setError(null);
                    setSuccess(null);
                    try {
                      await apiFetch(`/v1/admin/orders/${row.id}/auto-deliver`, { method: "POST" });
                      setSuccess(`Автовыдача заказа #${row.orderNumber} выполнена.`);
                      await load();
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "Не удалось выполнить автовыдачу");
                    }
                  }}>Выдать автоматически</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
