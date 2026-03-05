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
  const [form, setForm] = useState({ key: "support_link", locale: "ru", value: "https://t.me/gptishkasupp" });

  const load = async () => {
    const data = await apiFetch<Setting[]>("/v1/admin/settings");
    setRows(data);
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Создать или обновить настройку</h3>
        <div className="grid" style={{ gridTemplateColumns: "1fr 120px 1fr auto" }}>
          <input className="input" placeholder="Ключ" value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} />
          <select className="select" value={form.locale} onChange={(e) => setForm({ ...form, locale: e.target.value })}><option value="ru">ru</option><option value="en">en</option></select>
          <input className="input" placeholder="Значение" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
          <button className="btn btn-primary" onClick={async () => { await apiFetch("/v1/admin/settings", { method: "POST", body: JSON.stringify({ key: form.key, locale: form.locale, value: form.value }) }); await load(); }}>Сохранить</button>
        </div>
      </div>

      <div className="card">
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
