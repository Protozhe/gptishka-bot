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
  const [form, setForm] = useState({ authorName: "", textRu: "", textEn: "", rating: 5 });

  const load = async () => {
    const data = await apiFetch<Review[]>("/v1/admin/reviews");
    setRows(data);
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Add review</h3>
        <div className="grid">
          <input className="input" placeholder="Author" value={form.authorName} onChange={(e) => setForm({ ...form, authorName: e.target.value })} />
          <textarea className="textarea" rows={4} placeholder="Text RU" value={form.textRu} onChange={(e) => setForm({ ...form, textRu: e.target.value })} />
          <input className="input" placeholder="Text EN" value={form.textEn} onChange={(e) => setForm({ ...form, textEn: e.target.value })} />
          <input className="input" type="number" min={1} max={5} value={form.rating} onChange={(e) => setForm({ ...form, rating: Number(e.target.value) })} />
          <button className="btn btn-primary" onClick={async () => { await apiFetch("/v1/admin/reviews", { method: "POST", body: JSON.stringify({ ...form, isPublished: true, isPinned: false, sortOrder: 100 }) }); setForm({ authorName: "", textRu: "", textEn: "", rating: 5 }); await load(); }}>Create</button>
        </div>
      </div>
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Author</th><th>Rating</th><th>Text</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>{rows.map((row) => <tr key={row.id}><td>{row.authorName}</td><td>{row.rating}</td><td>{row.textRu}</td><td>{row.isPublished ? "Published" : "Hidden"}</td><td><button className="btn btn-secondary" onClick={async () => { await apiFetch(`/v1/admin/reviews/${row.id}`, { method: "PATCH", body: JSON.stringify({ isPublished: !row.isPublished }) }); await load(); }}>Toggle</button></td></tr>)}</tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
