"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

interface Promo {
  id: string;
  code: string;
  type: string;
  value: number;
  isActive: boolean;
  usageCount: number;
}

const promoTypeLabels: Record<string, string> = {
  percent: "Процент",
  fixed: "Фиксированная сумма"
};

export default function PromoPage() {
  const [rows, setRows] = useState<Promo[]>([]);
  const [form, setForm] = useState({ code: "", type: "percent", value: 34, onlyNewUsers: true, isOneTime: true });

  const load = async () => {
    const data = await apiFetch<Promo[]>("/v1/admin/promocodes");
    setRows(data);
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Создать промокод</h3>
        <div className="grid" style={{ gridTemplateColumns: "1fr 160px 160px auto" }}>
          <input className="input" placeholder="Код" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} />
          <select className="select" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}><option value="percent">Процент</option><option value="fixed">Фикс</option></select>
          <input className="input" type="number" value={form.value} onChange={(e) => setForm({ ...form, value: Number(e.target.value) })} />
          <button className="btn btn-primary" onClick={async () => { await apiFetch("/v1/admin/promocodes", { method: "POST", body: JSON.stringify({ ...form, isActive: true }) }); setForm({ code: "", type: "percent", value: 34, onlyNewUsers: true, isOneTime: true }); await load(); }}>Создать</button>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Промокоды</h3>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Код</th><th>Тип</th><th>Значение</th><th>Использований</th><th>Статус</th><th>Действие</th></tr></thead>
            <tbody>{rows.map((row) => <tr key={row.id}><td>{row.code}</td><td>{promoTypeLabels[row.type] || row.type}</td><td>{row.value}</td><td>{row.usageCount}</td><td>{row.isActive ? "Активен" : "Отключен"}</td><td><button className="btn btn-secondary" onClick={async () => { await apiFetch(`/v1/admin/promocodes/${row.id}`, { method: "PATCH", body: JSON.stringify({ isActive: !row.isActive }) }); await load(); }}>{row.isActive ? "Отключить" : "Включить"}</button></td></tr>)}</tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
