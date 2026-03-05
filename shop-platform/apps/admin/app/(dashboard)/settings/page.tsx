"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

interface Setting {
  id: string;
  key: string;
  locale: "ru" | "en";
  value: string;
}

export default function SettingsPage() {
  const [rows, setRows] = useState<Setting[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [form, setForm] = useState({ key: "support_link", locale: "ru", value: "https://t.me/gptishkasupp" });

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<Setting[]>("/v1/admin/settings");
      setRows(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить настройки");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const saveSetting = async () => {
    setError(null);
    setSuccess(null);
    if (form.key.trim().length < 1 || form.value.trim().length < 1) {
      setError("Ключ и значение должны быть заполнены.");
      return;
    }

    try {
      await apiFetch("/v1/admin/settings", { method: "POST", body: JSON.stringify({ key: form.key.trim(), locale: form.locale, value: form.value.trim() }) });
      setSuccess("Настройка сохранена.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить настройку");
    }
  };

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Создать или обновить настройку</h3>
        <div className="grid" style={{ gridTemplateColumns: "1fr 120px 1fr auto" }}>
          <input className="input" placeholder="Ключ" value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} />
          <select className="select" value={form.locale} onChange={(e) => setForm({ ...form, locale: e.target.value as "ru" | "en" })}><option value="ru">ru</option><option value="en">en</option></select>
          <input className="input" placeholder="Значение" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
          <button className="btn btn-primary" onClick={saveSetting}>Сохранить</button>
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
        <button className="btn btn-secondary" style={{ marginBottom: 12 }} onClick={load}>{loading ? "Загрузка..." : "Обновить"}</button>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Ключ</th><th>Язык</th><th>Значение</th></tr></thead>
            <tbody>{rows.map((row) => <tr key={row.id}><td>{row.key}</td><td>{row.locale}</td><td>{row.value}</td></tr>)}</tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
