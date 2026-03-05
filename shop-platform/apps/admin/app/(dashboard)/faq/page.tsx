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
  const [form, setForm] = useState({ category: "general", questionRu: "", answerRu: "", questionEn: "", answerEn: "" });

  const load = async () => {
    const data = await apiFetch<FAQ[]>("/v1/admin/faq");
    setRows(data);
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Add FAQ</h3>
        <div className="grid">
          <input className="input" placeholder="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
          <input className="input" placeholder="Question RU" value={form.questionRu} onChange={(e) => setForm({ ...form, questionRu: e.target.value })} />
          <textarea className="textarea" rows={4} placeholder="Answer RU" value={form.answerRu} onChange={(e) => setForm({ ...form, answerRu: e.target.value })} />
          <input className="input" placeholder="Question EN" value={form.questionEn} onChange={(e) => setForm({ ...form, questionEn: e.target.value })} />
          <textarea className="textarea" rows={4} placeholder="Answer EN" value={form.answerEn} onChange={(e) => setForm({ ...form, answerEn: e.target.value })} />
          <button className="btn btn-primary" onClick={async () => { await apiFetch("/v1/admin/faq", { method: "POST", body: JSON.stringify({ ...form, isPublished: true, sortOrder: 100 }) }); setForm({ category: "general", questionRu: "", answerRu: "", questionEn: "", answerEn: "" }); await load(); }}>Create</button>
        </div>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Category</th><th>Question</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>{rows.map((row) => <tr key={row.id}><td>{row.category}</td><td>{row.questionRu}</td><td>{row.isPublished ? "Published" : "Hidden"}</td><td><button className="btn btn-secondary" onClick={async () => { await apiFetch(`/v1/admin/faq/${row.id}`, { method: "PATCH", body: JSON.stringify({ isPublished: !row.isPublished }) }); await load(); }}>Toggle</button></td></tr>)}</tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
