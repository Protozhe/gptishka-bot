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

export default function OrdersPage() {
  const [rows, setRows] = useState<Order[]>([]);
  const [statusFilter, setStatusFilter] = useState("all");

  const load = async () => {
    const q = statusFilter !== "all" ? `?status=${statusFilter}` : "";
    const data = await apiFetch<{ items: Order[] }>(`/v1/admin/orders${q}`);
    setRows(data.items);
  };

  useEffect(() => { load(); }, [statusFilter]);

  return (
    <div className="card">
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <select className="select" style={{ width: 220 }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">All statuses</option>
          {statuses.map((status) => <option key={status} value={status}>{status}</option>)}
        </select>
        <button className="btn btn-secondary" onClick={load}>Refresh</button>
      </div>

      <div className="table-wrap">
        <table>
          <thead><tr><th>#</th><th>User</th><th>Product</th><th>Amount</th><th>Status</th><th>Date</th><th>Action</th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.orderNumber}</td><td>{row.user.telegramId}</td><td>{row.product.titleRu}</td><td>{row.amountRub} ₽</td><td>{row.status}</td><td>{new Date(row.createdAt).toLocaleString()}</td>
                <td style={{ display: "flex", gap: 8 }}>
                  <button className="btn btn-secondary" onClick={async () => { await apiFetch(`/v1/admin/orders/${row.id}/status`, { method: "PATCH", body: JSON.stringify({ status: "processing" }) }); await load(); }}>To processing</button>
                  <button className="btn btn-primary" onClick={async () => { await apiFetch(`/v1/admin/orders/${row.id}/auto-deliver`, { method: "POST" }); await load(); }}>Auto issue</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
