"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

interface Ticket {
  id: string;
  subject: string;
  status: string;
  user: { telegramId: string };
}

const ticketStatusLabels: Record<string, string> = {
  open: "Открыт",
  waiting_admin: "Ожидает администратора",
  waiting_user: "Ожидает пользователя",
  closed: "Закрыт"
};

export default function TicketsPage() {
  const [rows, setRows] = useState<Ticket[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");

  const load = async () => {
    const data = await apiFetch<Ticket[]>("/v1/admin/tickets?page=1&pageSize=100");
    setRows(data);
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="grid" style={{ gridTemplateColumns: "360px 1fr", gap: 16 }}>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Тикеты</h3>
        <div className="grid">
          {rows.map((row) => (
            <button key={row.id} className="btn btn-secondary" style={{ textAlign: "left", border: selected === row.id ? "1px solid rgba(34,197,94,.6)" : undefined }} onClick={() => setSelected(row.id)}>
              <div style={{ fontWeight: 600 }}>{row.subject}</div>
              <div className="muted" style={{ fontSize: 12 }}>{row.user.telegramId} · {ticketStatusLabels[row.status] || row.status}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Ответ</h3>
        {selected ? (
          <>
            <textarea className="textarea" rows={8} value={replyText} onChange={(e) => setReplyText(e.target.value)} placeholder="Напишите ответ" />
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button className="btn btn-primary" onClick={async () => { await apiFetch(`/v1/admin/tickets/${selected}/messages`, { method: "POST", body: JSON.stringify({ body: replyText, status: "waiting_user" }) }); setReplyText(""); await load(); }}>Отправить ответ</button>
              <button className="btn btn-secondary" onClick={async () => { await apiFetch(`/v1/admin/tickets/${selected}`, { method: "PATCH", body: JSON.stringify({ status: "closed" }) }); await load(); }}>Закрыть тикет</button>
            </div>
          </>
        ) : (
          <div className="muted">Выберите тикет слева</div>
        )}
      </div>
    </div>
  );
}
