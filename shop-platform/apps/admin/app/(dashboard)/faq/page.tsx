"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

interface FAQ {
  id: string;
  category: string;
  questionRu: string;
  isPublished: boolean;
}

export default function FaqPage() {
  const [rows, setRows] = useState<FAQ[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [form, setForm] = useState({ category: "general", questionRu: "", answerRu: "", questionEn: "", answerEn: "" });

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<FAQ[]>("/v1/admin/faq");
      setRows(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить FAQ");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const createFaq = async () => {
    setError(null);
    setSuccess(null);
    if (form.category.trim().length < 1 || form.questionRu.trim().length < 1 || form.answerRu.trim().length < 1) {
      setError("Заполните категорию, вопрос и ответ на русском.");
      return;
    }

    try {
      await apiFetch("/v1/admin/faq", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          questionEn: form.questionEn.trim() || form.questionRu.trim(),
          answerEn: form.answerEn.trim() || form.answerRu.trim(),
          isPublished: true,
          sortOrder: 100
        })
      });
      setForm({ category: "general", questionRu: "", answerRu: "", questionEn: "", answerEn: "" });
      setSuccess("FAQ создан.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось создать FAQ");
    }
  };

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Добавить FAQ</h3>
        <div className="grid">
          <input className="input" placeholder="Категория" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
          <input className="input" placeholder="Вопрос (RU)" value={form.questionRu} onChange={(e) => setForm({ ...form, questionRu: e.target.value })} />
          <textarea className="textarea" rows={4} placeholder="Ответ (RU)" value={form.answerRu} onChange={(e) => setForm({ ...form, answerRu: e.target.value })} />
          <input className="input" placeholder="Вопрос (EN, необязательно)" value={form.questionEn} onChange={(e) => setForm({ ...form, questionEn: e.target.value })} />
          <textarea className="textarea" rows={4} placeholder="Ответ (EN, необязательно)" value={form.answerEn} onChange={(e) => setForm({ ...form, answerEn: e.target.value })} />
          <button className="btn btn-primary" onClick={createFaq}>Создать</button>
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
            <thead><tr><th>Категория</th><th>Вопрос</th><th>Статус</th><th>Действие</th></tr></thead>
            <tbody>{rows.map((row) => <tr key={row.id}><td>{row.category}</td><td>{row.questionRu}</td><td>{row.isPublished ? "Опубликован" : "Скрыт"}</td><td><button className="btn btn-secondary" onClick={async () => {
              setError(null);
              setSuccess(null);
              try {
                await apiFetch(`/v1/admin/faq/${row.id}`, { method: "PATCH", body: JSON.stringify({ isPublished: !row.isPublished }) });
                setSuccess(row.isPublished ? "FAQ скрыт." : "FAQ опубликован.");
                await load();
              } catch (e) {
                setError(e instanceof Error ? e.message : "Не удалось изменить статус FAQ");
              }
            }}>Переключить</button></td></tr>)}</tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
