"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type AdminRole = "superadmin" | "admin" | "support";

interface InventoryItem {
  id: string;
  secretValue: string;
  status: "unused" | "reserved" | "issued";
  createdAt: string;
  issuedAt?: string | null;
  reservedUntil?: string | null;
  issuedOrder?: {
    id: string;
    orderNumber: number;
    telegramId: string;
    username?: string | null;
  } | null;
}

interface InventoryCard {
  productId: string;
  sku: string;
  titleRu: string;
  titleEn?: string;
  isActive: boolean;
  counts: {
    total: number;
    unused: number;
    reserved: number;
    issued: number;
  };
  items: InventoryItem[];
}

interface UploadResult {
  productId: string;
  productSku: string;
  submitted: number;
  unique: number;
  added: number;
  duplicatesInBatch: number;
  duplicatesInStorage: number;
}

const statusLabel: Record<InventoryItem["status"], string> = {
  unused: "Неиспользован",
  reserved: "Зарезервирован",
  issued: "Выдан"
};

export default function CdkPage() {
  const [cards, setCards] = useState<InventoryCard[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [busyProductId, setBusyProductId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [role, setRole] = useState<AdminRole>("support");

  const canUpload = role === "admin" || role === "superadmin";
  const canDelete = role === "superadmin";

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [overview, me] = await Promise.all([
        apiFetch<InventoryCard[]>(`/v1/admin/inventory/overview?perProductLimit=25${searchQuery ? `&search=${encodeURIComponent(searchQuery)}` : ""}`),
        apiFetch<{ role: AdminRole }>("/v1/admin/auth/me")
      ]);
      setCards(overview);
      setRole(me.role);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить склад ключей");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [searchQuery]);

  const handleUpload = async (card: InventoryCard) => {
    setError(null);
    setSuccess(null);

    if (!canUpload) {
      setError("Недостаточно прав для загрузки ключей.");
      return;
    }

    const keysText = drafts[card.productId]?.trim();
    if (!keysText) {
      setError(`Введите ключи для товара ${card.titleRu}.`);
      return;
    }

    setBusyProductId(card.productId);
    try {
      const result = await apiFetch<UploadResult>(`/v1/admin/inventory/${card.productId}/upload`, {
        method: "POST",
        body: JSON.stringify({ keysText })
      });
      setSuccess(
        `Товар ${result.productSku}: добавлено ${result.added}, дубликаты в партии ${result.duplicatesInBatch}, уже на складе ${result.duplicatesInStorage}.`
      );
      setDrafts((prev) => ({ ...prev, [card.productId]: "" }));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить ключи");
    } finally {
      setBusyProductId(null);
    }
  };

  const handleDelete = async (card: InventoryCard, item: InventoryItem) => {
    setError(null);
    setSuccess(null);

    if (!canDelete) {
      setError("Удаление ключей доступно только superadmin.");
      return;
    }

    const phrase = `DELETE ${item.id}`;
    const typed = window.prompt(
      `Удаление необратимо.\nТовар: ${card.titleRu}\nКлюч: ${item.secretValue}\n\nВведите фразу подтверждения:\n${phrase}`
    );
    if (!typed) return;

    try {
      await apiFetch(`/v1/admin/inventory/${item.id}/delete`, {
        method: "POST",
        body: JSON.stringify({ confirmPhrase: typed })
      });
      setSuccess(`Ключ удален из склада (${card.sku}).`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось удалить ключ");
    }
  };

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="card">
        <h3 style={{ marginTop: 0, marginBottom: 8 }}>CDK ключи по товарам</h3>
        <div className="muted" style={{ marginBottom: 10 }}>
          Отдельный склад ключей на каждый товар. Автовыдача идет строго из ключей выбранного товара.
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8 }}>
          <input
            className="input"
            placeholder="Поиск по ключу / Telegram ID / номеру заказа"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setSearchQuery(searchInput.trim());
              }
            }}
          />
          <button className="btn btn-secondary" onClick={() => setSearchQuery(searchInput.trim())}>
            Поиск
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => {
              setSearchInput("");
              setSearchQuery("");
            }}
          >
            Сброс
          </button>
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

      {!canDelete ? (
        <div className="card" style={{ borderColor: "rgba(245,158,11,.35)" }}>
          <div className="muted">
            Защита склада: удаление ключей отключено для вашей роли. Удалять ключи может только superadmin и только с фразой подтверждения.
          </div>
        </div>
      ) : null}

      {loading ? <div className="card">Загрузка склада ключей...</div> : null}

      <div className="inventory-grid">
        {cards.map((card) => (
          <div className="card inventory-card" key={card.productId}>
            <div className="inventory-card-head">
              <div>
                <div className="inventory-title">{card.titleRu}</div>
                <div className="muted inventory-sub">
                  {card.sku} {card.isActive ? "" : "· отключен"}
                </div>
              </div>
              <div className="inventory-counts">
                <div>Неисп.: {card.counts.unused}</div>
                <div>Резерв: {card.counts.reserved}</div>
                <div>Выдано: {card.counts.issued}</div>
              </div>
            </div>

            <textarea
              className="textarea"
              rows={4}
              placeholder="Вставьте CDK ключи (по одному в строке)"
              value={drafts[card.productId] || ""}
              onChange={(e) => setDrafts((prev) => ({ ...prev, [card.productId]: e.target.value }))}
              disabled={!canUpload || busyProductId === card.productId}
            />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
              <button className="btn btn-primary" onClick={() => handleUpload(card)} disabled={!canUpload || busyProductId === card.productId}>
                {busyProductId === card.productId ? "Загружаем..." : "Загрузить ключи"}
              </button>
              <div className="muted" style={{ fontSize: 12 }}>
                Всего в товаре: {card.counts.total}
              </div>
            </div>

            <div className="table-wrap" style={{ marginTop: 12 }}>
              <table>
                <thead>
                  <tr>
                    <th>CDK</th>
                    <th>Статус</th>
                    <th>Клиент</th>
                    <th>Заказ</th>
                    <th>Дата</th>
                    <th>Действие</th>
                  </tr>
                </thead>
                <tbody>
                  {card.items.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="muted">
                        Нет ключей
                      </td>
                    </tr>
                  ) : (
                    card.items.map((item) => (
                      <tr key={item.id}>
                        <td className="mono">{item.secretValue}</td>
                        <td>{statusLabel[item.status] || item.status}</td>
                        <td>{item.issuedOrder?.telegramId || "-"}</td>
                        <td>{item.issuedOrder ? `#${item.issuedOrder.orderNumber}` : "-"}</td>
                        <td>{new Date(item.issuedAt || item.createdAt).toLocaleString()}</td>
                        <td>
                          {item.status === "unused" ? (
                            <button className="btn btn-secondary" disabled={!canDelete} onClick={() => handleDelete(card, item)}>
                              Удалить
                            </button>
                          ) : (
                            <span className="muted">-</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
