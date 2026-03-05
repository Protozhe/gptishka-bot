"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

interface Review {
  id: string;
  authorName: string;
  textRu: string;
  isPublished: boolean;
  rating: number;
}

export default function ReviewsPage() {
  const [rows, setRows] = useState<Review[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [form, setForm] = useState({ authorName: "", textRu: "", textEn: "", rating: 5 });

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<Review[]>("/v1/admin/reviews");
      setRows(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить отзывы");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const createReview = async () => {
    setError(null);
    setSuccess(null);

    if (form.authorName.trim().length < 1) {
      setError("Укажите автора.");
      return;
    }
    if (form.textRu.trim().length < 1) {
      setError("Укажите текст отзыва (RU).");
      return;
    }
    if (form.rating < 1 || form.rating > 5) {
      setError("Оценка должна быть от 1 до 5.");
      return;
    }

    try {
      await apiFetch("/v1/admin/reviews", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          textEn: form.textEn.trim() || form.textRu.trim(),
          isPublished: true,
          isPinned: false,
          sortOrder: 100
        })
      });
      setForm({ authorName: "", textRu: "", textEn: "", rating: 5 });
      setSuccess("Отзыв создан.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось создать отзыв");
    }
  };

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Добавить отзыв</h3>
        <div className="grid">
          <input className="input" placeholder="Автор" value={form.authorName} onChange={(e) => setForm({ ...form, authorName: e.target.value })} />
          <textarea className="textarea" rows={4} placeholder="Текст (RU)" value={form.textRu} onChange={(e) => setForm({ ...form, textRu: e.target.value })} />
          <input className="input" placeholder="Текст (EN, необязательно)" value={form.textEn} onChange={(e) => setForm({ ...form, textEn: e.target.value })} />
          <input className="input" type="number" min={1} max={5} value={form.rating} onChange={(e) => setForm({ ...form, rating: Number(e.target.value) })} />
          <button className="btn btn-primary" onClick={createReview}>Создать</button>
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
            <thead><tr><th>Автор</th><th>Оценка</th><th>Текст</th><th>Статус</th><th>Действие</th></tr></thead>
            <tbody>{rows.map((row) => <tr key={row.id}><td>{row.authorName}</td><td>{row.rating}</td><td>{row.textRu}</td><td>{row.isPublished ? "Опубликован" : "Скрыт"}</td><td><button className="btn btn-secondary" onClick={async () => {
              setError(null);
              setSuccess(null);
              try {
                await apiFetch(`/v1/admin/reviews/${row.id}`, { method: "PATCH", body: JSON.stringify({ isPublished: !row.isPublished }) });
                setSuccess(row.isPublished ? "Отзыв скрыт." : "Отзыв опубликован.");
                await load();
              } catch (e) {
                setError(e instanceof Error ? e.message : "Не удалось изменить статус отзыва");
              }
            }}>Переключить</button></td></tr>)}</tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
