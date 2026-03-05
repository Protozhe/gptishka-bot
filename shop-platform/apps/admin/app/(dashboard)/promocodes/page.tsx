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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [form, setForm] = useState({ code: "", type: "percent", value: 34, onlyNewUsers: true, isOneTime: true });

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<Promo[]>("/v1/admin/promocodes");
      setRows(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить промокоды");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const createPromo = async () => {
    setError(null);
    setSuccess(null);
    const code = form.code.trim().toUpperCase();
    if (code.length < 2) {
      setError("Код промокода должен содержать минимум 2 символа.");
      return;
    }
    if (form.value <= 0) {
      setError("Значение промокода должно быть больше 0.");
      return;
    }

    try {
      await apiFetch("/v1/admin/promocodes", { method: "POST", body: JSON.stringify({ ...form, code, isActive: true }) });
      setForm({ code: "", type: "percent", value: 34, onlyNewUsers: true, isOneTime: true });
      setSuccess("Промокод создан.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось создать промокод");
    }
  };

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Создать промокод</h3>
        <div className="grid" style={{ gridTemplateColumns: "1fr 160px 160px auto" }}>
          <input className="input" placeholder="Код" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} />
          <select className="select" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}><option value="percent">Процент</option><option value="fixed">Фикс</option></select>
          <input className="input" type="number" value={form.value} onChange={(e) => setForm({ ...form, value: Number(e.target.value) })} />
          <button className="btn btn-primary" onClick={createPromo}>Создать</button>
        </div>
      </div>

      {error ? (
        <div style={{ color: "#fecaca", border: "1px solid rgba(239,68,68,.4)", borderRadius: 10, padding: 10 }}>
          {error}
        </div>
      ) : null}
      {success ? (
        <div style={{ color: "#bbf7d0", border: "1px solid rgba(34,197,94,.4)", borderRadius: 10, padding: 10 }}>
          {success}
        </div>
      ) : null}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Промокоды</h3>
        <button className="btn btn-secondary" style={{ marginBottom: 12 }} onClick={load}>{loading ? "Загрузка..." : "Обновить"}</button>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Код</th><th>Тип</th><th>Значение</th><th>Использований</th><th>Статус</th><th>Действие</th></tr></thead>
            <tbody>{rows.map((row) => <tr key={row.id}><td>{row.code}</td><td>{promoTypeLabels[row.type] || row.type}</td><td>{row.value}</td><td>{row.usageCount}</td><td>{row.isActive ? "Активен" : "Отключен"}</td><td><button className="btn btn-secondary" onClick={async () => {
              setError(null);
              setSuccess(null);
              try {
                await apiFetch(`/v1/admin/promocodes/${row.id}`, { method: "PATCH", body: JSON.stringify({ isActive: !row.isActive }) });
                setSuccess(row.isActive ? "Промокод отключен." : "Промокод включен.");
                await load();
              } catch (e) {
                setError(e instanceof Error ? e.message : "Не удалось изменить статус промокода");
              }
            }}>{row.isActive ? "Отключить" : "Включить"}</button></td></tr>)}</tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
