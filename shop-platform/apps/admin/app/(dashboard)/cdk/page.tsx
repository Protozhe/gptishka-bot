"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type AdminRole = "superadmin" | "admin" | "support";
type InventoryTab = "active" | "archive";

interface InventoryItem {
  id: string;
  secretValue: string;
  status: "unused" | "reserved" | "issued";
  isReserved?: boolean;
  reservedUntil?: string | null;
  isIssued?: boolean;
  createdAt: string;
  issuedAt?: string | null;
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
  items?: InventoryItem[];
  unusedItems?: InventoryItem[];
  usedItems?: InventoryItem[];
}

interface ArchiveItem {
  id: string;
  secretValue: string;
  archivedAt?: string | null;
  archivedBy?: string | null;
  createdAt: string;
}

interface ArchiveCard {
  productId: string;
  sku: string;
  titleRu: string;
  isActive: boolean;
  archivedCount: number;
  items: ArchiveItem[];
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

interface BackupRow {
  id: string;
  snapshotDate: string;
  itemCount: number;
  createdBy: string;
  createdAt: string;
}

const statusLabel: Record<InventoryItem["status"], string> = {
  unused: "Неиспользован",
  reserved: "Зарезервирован",
  issued: "Использован"
};

function formatDate(value?: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

function normalizeUnusedItems(card: InventoryCard): InventoryItem[] {
  if (card.unusedItems) return card.unusedItems;
  return (card.items || []).filter((item) => item.status !== "issued");
}

function normalizeUsedItems(card: InventoryCard): InventoryItem[] {
  if (card.usedItems) return card.usedItems;
  return (card.items || []).filter((item) => item.status === "issued");
}

export default function CdkPage() {
  const [role, setRole] = useState<AdminRole>("support");
  const [tab, setTab] = useState<InventoryTab>("active");
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCards, setActiveCards] = useState<InventoryCard[]>([]);
  const [archiveCards, setArchiveCards] = useState<ArchiveCard[]>([]);
  const [backups, setBackups] = useState<BackupRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [busyProductId, setBusyProductId] = useState<string | null>(null);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [backupBusy, setBackupBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const canUpload = role === "admin" || role === "superadmin";
  const canArchive = role === "admin" || role === "superadmin";
  const canPurge = role === "admin" || role === "superadmin";
  const canUnarchive = role === "admin" || role === "superadmin";
  const canRestoreBackup = role === "superadmin";

  const totalStats = useMemo(() => {
    return activeCards.reduce(
      (acc, card) => {
        acc.total += card.counts.total;
        acc.unused += card.counts.unused;
        acc.reserved += card.counts.reserved;
        acc.issued += card.counts.issued;
        return acc;
      },
      { total: 0, unused: 0, reserved: 0, issued: 0 }
    );
  }, [activeCards]);

  const loadAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const [active, archive, backupsList, me] = await Promise.all([
        apiFetch<InventoryCard[]>(`/v1/admin/inventory/overview?perProductLimit=100${searchQuery ? `&search=${encodeURIComponent(searchQuery)}` : ""}`),
        apiFetch<ArchiveCard[]>(`/v1/admin/inventory/archive?perProductLimit=100${searchQuery ? `&search=${encodeURIComponent(searchQuery)}` : ""}`),
        apiFetch<BackupRow[]>("/v1/admin/inventory/backups"),
        apiFetch<{ role: AdminRole }>("/v1/admin/auth/me")
      ]);
      setActiveCards(active);
      setArchiveCards(archive);
      setBackups(backupsList);
      setRole(me.role);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить склад CDK.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAll();
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
        `Товар ${result.productSku}: добавлено ${result.added}, дубликаты в партии ${result.duplicatesInBatch}, уже существующие ${result.duplicatesInStorage}.`
      );
      setDrafts((prev) => ({ ...prev, [card.productId]: "" }));
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить ключи.");
    } finally {
      setBusyProductId(null);
    }
  };

  const handleArchive = async (card: InventoryCard, item: InventoryItem) => {
    setError(null);
    setSuccess(null);
    if (!canArchive) {
      setError("Недостаточно прав для архивации.");
      return;
    }

    setBusyItemId(item.id);
    try {
      await apiFetch(`/v1/admin/inventory/${item.id}/archive`, { method: "POST" });
      setSuccess(`Ключ отправлен в архив (${card.sku}).`);
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось отправить ключ в архив.");
    } finally {
      setBusyItemId(null);
    }
  };

  const handleUnarchive = async (card: ArchiveCard, item: ArchiveItem) => {
    setError(null);
    setSuccess(null);
    if (!canUnarchive) {
      setError("Недостаточно прав для возврата ключа.");
      return;
    }

    setBusyItemId(item.id);
    try {
      await apiFetch(`/v1/admin/inventory/${item.id}/unarchive`, { method: "POST" });
      setSuccess(`Ключ возвращен в товар (${card.sku}).`);
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось вернуть ключ в товар.");
    } finally {
      setBusyItemId(null);
    }
  };

  const handlePurge = async (card: ArchiveCard, item: ArchiveItem) => {
    setError(null);
    setSuccess(null);
    if (!canPurge) {
      setError("Недостаточно прав для удаления из архива.");
      return;
    }

    setBusyItemId(item.id);
    try {
      await apiFetch(`/v1/admin/inventory/${item.id}/purge`, { method: "POST" });
      setSuccess(`Ключ удален из архива (${card.sku}).`);
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось удалить ключ из архива.");
    } finally {
      setBusyItemId(null);
    }
  };

  const handleCreateBackup = async () => {
    setError(null);
    setSuccess(null);
    setBackupBusy(true);
    try {
      await apiFetch("/v1/admin/inventory/backups/create", { method: "POST" });
      setSuccess("Бэкап склада создан.");
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось создать бэкап.");
    } finally {
      setBackupBusy(false);
    }
  };

  const handleRestoreBackup = async (backup: BackupRow) => {
    setError(null);
    setSuccess(null);
    if (!canRestoreBackup) {
      setError("Откат бэкапа доступен только superadmin.");
      return;
    }

    const ok = window.confirm(`Откатить склад к бэкапу ${new Date(backup.snapshotDate).toLocaleDateString()}?`);
    if (!ok) return;

    setBackupBusy(true);
    try {
      const result = await apiFetch<{ restoredItems: number }>(`/v1/admin/inventory/backups/${backup.id}/restore`, { method: "POST" });
      setSuccess(`Склад откатан. Восстановлено ключей: ${result.restoredItems}.`);
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось выполнить откат.");
    } finally {
      setBackupBusy(false);
    }
  };

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="card">
        <h3 style={{ marginTop: 0, marginBottom: 8 }}>CDK ключи по товарам</h3>
        <div className="muted" style={{ marginBottom: 10 }}>
          Склад ключей разделен по товарам. Карточки одинаковые по структуре и отличаются только названием товара.
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8 }}>
          <input
            className="input"
            placeholder="Поиск по ключу / Telegram ID / номеру заказа"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") setSearchQuery(searchInput.trim());
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

        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button className={`btn ${tab === "active" ? "btn-primary" : "btn-secondary"}`} onClick={() => setTab("active")}>
            Активный склад
          </button>
          <button className={`btn ${tab === "archive" ? "btn-primary" : "btn-secondary"}`} onClick={() => setTab("archive")}>
            Архив
          </button>
        </div>
      </div>

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div className="inventory-pills-row">
            <span className="inventory-pill">Всего: {totalStats.total}</span>
            <span className="inventory-pill">Неиспользованные: {totalStats.unused}</span>
            <span className="inventory-pill">Резерв: {totalStats.reserved}</span>
            <span className="inventory-pill">Использованные: {totalStats.issued}</span>
          </div>
          <button className="btn btn-secondary" disabled={backupBusy} onClick={handleCreateBackup}>
            {backupBusy ? "Обработка..." : "Создать бэкап"}
          </button>
        </div>

        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table>
            <thead>
              <tr>
                <th>Дата бэкапа</th>
                <th>Ключей</th>
                <th>Кем создан</th>
                <th>Создан</th>
                <th>Действие</th>
              </tr>
            </thead>
            <tbody>
              {backups.length === 0 ? (
                <tr>
                  <td colSpan={5} className="muted">
                    Бэкапы не найдены
                  </td>
                </tr>
              ) : (
                backups.map((backup) => (
                  <tr key={backup.id}>
                    <td>{new Date(backup.snapshotDate).toLocaleDateString()}</td>
                    <td>{backup.itemCount}</td>
                    <td>{backup.createdBy}</td>
                    <td>{formatDate(backup.createdAt)}</td>
                    <td>
                      <button className="btn btn-secondary" disabled={!canRestoreBackup || backupBusy} onClick={() => handleRestoreBackup(backup)}>
                        Откатить
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {error ? (
        <div style={{ color: "#fecaca", border: "1px solid rgba(239,68,68,.4)", borderRadius: 10, padding: 10 }}>{error}</div>
      ) : null}
      {success ? (
        <div style={{ color: "#bbf7d0", border: "1px solid rgba(34,197,94,.4)", borderRadius: 10, padding: 10 }}>{success}</div>
      ) : null}
      {loading ? <div className="card">Загрузка склада ключей...</div> : null}

      {tab === "active" ? (
        <div className="inventory-grid">
          {activeCards.map((card) => {
            const unusedItems = normalizeUnusedItems(card);
            const usedItems = normalizeUsedItems(card);

            return (
              <div className="card inventory-card inventory-card--fixed" key={card.productId}>
                <div className="inventory-card-head">
                  <div>
                    <div className="inventory-title">{card.titleRu}</div>
                    <div className="muted inventory-sub">
                      {card.sku} {card.isActive ? "" : "· отключен"}
                    </div>
                  </div>
                  <div className="inventory-counts">
                    <div>Всего: {card.counts.total}</div>
                    <div>Резерв: {card.counts.reserved}</div>
                  </div>
                </div>

                <div className="inventory-pills-row">
                  <span className="inventory-pill">Неиспользованные: {card.counts.unused}</span>
                  <span className="inventory-pill">Использованные: {card.counts.issued}</span>
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
                    Автовыдача берет ключ только из этого товара
                  </div>
                </div>

                <div className="inventory-sections">
                  <div className="inventory-section">
                    <div className="inventory-section-head">Неиспользованные и резерв</div>
                    <div className="table-wrap inventory-table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>CDK</th>
                            <th>Статус</th>
                            <th>Резерв до</th>
                            <th>Действие</th>
                          </tr>
                        </thead>
                        <tbody>
                          {unusedItems.length === 0 ? (
                            <tr>
                              <td colSpan={4} className="muted">
                                Нет ключей
                              </td>
                            </tr>
                          ) : (
                            unusedItems.map((item) => (
                              <tr key={item.id}>
                                <td className="mono">{item.secretValue}</td>
                                <td>{statusLabel[item.status] || item.status}</td>
                                <td>{formatDate(item.reservedUntil)}</td>
                                <td>
                                  <button
                                    className="btn btn-secondary"
                                    disabled={!canArchive || busyItemId === item.id || item.status !== "unused"}
                                    onClick={() => handleArchive(card, item)}
                                  >
                                    В архив
                                  </button>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="inventory-section">
                    <div className="inventory-section-head">Использованные</div>
                    <div className="table-wrap inventory-table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>CDK</th>
                            <th>Telegram ID</th>
                            <th>Username</th>
                            <th>Заказ</th>
                            <th>Дата выдачи</th>
                          </tr>
                        </thead>
                        <tbody>
                          {usedItems.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="muted">
                                Использованных ключей нет
                              </td>
                            </tr>
                          ) : (
                            usedItems.map((item) => (
                              <tr key={item.id}>
                                <td className="mono">{item.secretValue}</td>
                                <td>{item.issuedOrder?.telegramId || "-"}</td>
                                <td>{item.issuedOrder?.username || "-"}</td>
                                <td>{item.issuedOrder ? `#${item.issuedOrder.orderNumber}` : "-"}</td>
                                <td>{formatDate(item.issuedAt || item.createdAt)}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="inventory-grid">
          {archiveCards.map((card) => (
            <div className="card inventory-card inventory-card--archive" key={card.productId}>
              <div className="inventory-card-head">
                <div>
                  <div className="inventory-title">{card.titleRu}</div>
                  <div className="muted inventory-sub">{card.sku}</div>
                </div>
                <div className="inventory-counts">
                  <div>В архиве: {card.archivedCount}</div>
                </div>
              </div>

              <div className="table-wrap inventory-table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>CDK</th>
                      <th>Архивирован</th>
                      <th>Кем</th>
                      <th>Действие</th>
                    </tr>
                  </thead>
                  <tbody>
                    {card.items.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="muted">
                          Архив пуст
                        </td>
                      </tr>
                    ) : (
                      card.items.map((item) => (
                        <tr key={item.id}>
                          <td className="mono">{item.secretValue}</td>
                          <td>{formatDate(item.archivedAt || item.createdAt)}</td>
                          <td>{item.archivedBy || "-"}</td>
                          <td>
                            <div className="inventory-actions-inline">
                              <button
                                className="btn btn-primary"
                                disabled={!canUnarchive || busyItemId === item.id}
                                onClick={() => handleUnarchive(card, item)}
                              >
                                Вернуть в товар
                              </button>
                              <button
                                className="btn btn-secondary"
                                disabled={!canPurge || busyItemId === item.id}
                                onClick={() => handlePurge(card, item)}
                              >
                                Удалить
                              </button>
                            </div>
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
      )}
    </div>
  );
}
