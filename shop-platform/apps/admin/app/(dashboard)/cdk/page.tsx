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
  unused: "РќРµРёСЃРїРѕР»СЊР·РѕРІР°РЅ",
  reserved: "Р—Р°СЂРµР·РµСЂРІРёСЂРѕРІР°РЅ",
  issued: "РСЃРїРѕР»СЊР·РѕРІР°РЅ"
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
      setError(e instanceof Error ? e.message : "РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ СЃРєР»Р°Рґ CDK.");
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
      setError("РќРµРґРѕСЃС‚Р°С‚РѕС‡РЅРѕ РїСЂР°РІ РґР»СЏ Р·Р°РіСЂСѓР·РєРё РєР»СЋС‡РµР№.");
      return;
    }

    const keysText = drafts[card.productId]?.trim();
    if (!keysText) {
      setError(`Р’РІРµРґРёС‚Рµ РєР»СЋС‡Рё РґР»СЏ С‚РѕРІР°СЂР° ${card.titleRu}.`);
      return;
    }

    setBusyProductId(card.productId);
    try {
      const result = await apiFetch<UploadResult>(`/v1/admin/inventory/${card.productId}/upload`, {
        method: "POST",
        body: JSON.stringify({ keysText })
      });
      setSuccess(
        `РўРѕРІР°СЂ ${result.productSku}: РґРѕР±Р°РІР»РµРЅРѕ ${result.added}, РґСѓР±Р»РёРєР°С‚С‹ РІ РїР°СЂС‚РёРё ${result.duplicatesInBatch}, СѓР¶Рµ СЃСѓС‰РµСЃС‚РІСѓСЋС‰РёРµ ${result.duplicatesInStorage}.`
      );
      setDrafts((prev) => ({ ...prev, [card.productId]: "" }));
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ РєР»СЋС‡Рё.");
    } finally {
      setBusyProductId(null);
    }
  };

  const handleArchive = async (card: InventoryCard, item: InventoryItem) => {
    setError(null);
    setSuccess(null);
    if (!canArchive) {
      setError("РќРµРґРѕСЃС‚Р°С‚РѕС‡РЅРѕ РїСЂР°РІ РґР»СЏ Р°СЂС…РёРІР°С†РёРё.");
      return;
    }

    setBusyItemId(item.id);
    try {
      await apiFetch(`/v1/admin/inventory/${item.id}/archive`, { method: "POST" });
      setSuccess(`РљР»СЋС‡ РѕС‚РїСЂР°РІР»РµРЅ РІ Р°СЂС…РёРІ (${card.sku}).`);
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "РќРµ СѓРґР°Р»РѕСЃСЊ РѕС‚РїСЂР°РІРёС‚СЊ РєР»СЋС‡ РІ Р°СЂС…РёРІ.");
    } finally {
      setBusyItemId(null);
    }
  };

  const handleUnarchive = async (card: ArchiveCard, item: ArchiveItem) => {
    setError(null);
    setSuccess(null);
    if (!canUnarchive) {
      setError("РќРµРґРѕСЃС‚Р°С‚РѕС‡РЅРѕ РїСЂР°РІ РґР»СЏ РІРѕР·РІСЂР°С‚Р° РєР»СЋС‡Р°.");
      return;
    }

    setBusyItemId(item.id);
    try {
      await apiFetch(`/v1/admin/inventory/${item.id}/unarchive`, { method: "POST" });
      setSuccess(`РљР»СЋС‡ РІРѕР·РІСЂР°С‰РµРЅ РІ С‚РѕРІР°СЂ (${card.sku}).`);
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "РќРµ СѓРґР°Р»РѕСЃСЊ РІРµСЂРЅСѓС‚СЊ РєР»СЋС‡ РІ С‚РѕРІР°СЂ.");
    } finally {
      setBusyItemId(null);
    }
  };

  const handlePurge = async (card: ArchiveCard, item: ArchiveItem) => {
    setError(null);
    setSuccess(null);
    if (!canPurge) {
      setError("РќРµРґРѕСЃС‚Р°С‚РѕС‡РЅРѕ РїСЂР°РІ РґР»СЏ СѓРґР°Р»РµРЅРёСЏ РёР· Р°СЂС…РёРІР°.");
      return;
    }

    setBusyItemId(item.id);
    try {
      await apiFetch(`/v1/admin/inventory/${item.id}/purge`, { method: "POST" });
      setSuccess(`РљР»СЋС‡ СѓРґР°Р»РµРЅ РёР· Р°СЂС…РёРІР° (${card.sku}).`);
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "РќРµ СѓРґР°Р»РѕСЃСЊ СѓРґР°Р»РёС‚СЊ РєР»СЋС‡ РёР· Р°СЂС…РёРІР°.");
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
      setSuccess("Р‘СЌРєР°Рї СЃРєР»Р°РґР° СЃРѕР·РґР°РЅ.");
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "РќРµ СѓРґР°Р»РѕСЃСЊ СЃРѕР·РґР°С‚СЊ Р±СЌРєР°Рї.");
    } finally {
      setBackupBusy(false);
    }
  };

  const handleRestoreBackup = async (backup: BackupRow) => {
    setError(null);
    setSuccess(null);
    if (!canRestoreBackup) {
      setError("РћС‚РєР°С‚ Р±СЌРєР°РїР° РґРѕСЃС‚СѓРїРµРЅ С‚РѕР»СЊРєРѕ superadmin.");
      return;
    }

    const ok = window.confirm(`РћС‚РєР°С‚РёС‚СЊ СЃРєР»Р°Рґ Рє Р±СЌРєР°РїСѓ ${new Date(backup.snapshotDate).toLocaleDateString()}?`);
    if (!ok) return;

    setBackupBusy(true);
    try {
      const result = await apiFetch<{ restoredItems: number }>(`/v1/admin/inventory/backups/${backup.id}/restore`, { method: "POST" });
      setSuccess(`РЎРєР»Р°Рґ РѕС‚РєР°С‚Р°РЅ. Р’РѕСЃСЃС‚Р°РЅРѕРІР»РµРЅРѕ РєР»СЋС‡РµР№: ${result.restoredItems}.`);
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "РќРµ СѓРґР°Р»РѕСЃСЊ РІС‹РїРѕР»РЅРёС‚СЊ РѕС‚РєР°С‚.");
    } finally {
      setBackupBusy(false);
    }
  };

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="card">
        <h3 style={{ marginTop: 0, marginBottom: 8 }}>CDK РєР»СЋС‡Рё РїРѕ С‚РѕРІР°СЂР°Рј</h3>
        <div className="muted" style={{ marginBottom: 10 }}>
          РЎРєР»Р°Рґ РєР»СЋС‡РµР№ СЂР°Р·РґРµР»РµРЅ РїРѕ С‚РѕРІР°СЂР°Рј. РљР°СЂС‚РѕС‡РєРё РѕРґРёРЅР°РєРѕРІС‹Рµ РїРѕ СЃС‚СЂСѓРєС‚СѓСЂРµ Рё РѕС‚Р»РёС‡Р°СЋС‚СЃСЏ С‚РѕР»СЊРєРѕ РЅР°Р·РІР°РЅРёРµРј С‚РѕРІР°СЂР°.
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8 }}>
          <input
            className="input"
            placeholder="РџРѕРёСЃРє РїРѕ РєР»СЋС‡Сѓ / Telegram ID / РЅРѕРјРµСЂСѓ Р·Р°РєР°Р·Р°"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") setSearchQuery(searchInput.trim());
            }}
          />
          <button className="btn btn-secondary" onClick={() => setSearchQuery(searchInput.trim())}>
            РџРѕРёСЃРє
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => {
              setSearchInput("");
              setSearchQuery("");
            }}
          >
            РЎР±СЂРѕСЃ
          </button>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button className={`btn ${tab === "active" ? "btn-primary" : "btn-secondary"}`} onClick={() => setTab("active")}>
            РђРєС‚РёРІРЅС‹Р№ СЃРєР»Р°Рґ
          </button>
          <button className={`btn ${tab === "archive" ? "btn-primary" : "btn-secondary"}`} onClick={() => setTab("archive")}>
            РђСЂС…РёРІ
          </button>
        </div>
      </div>

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div className="inventory-pills-row">
            <span className="inventory-pill">Р’СЃРµРіРѕ: {totalStats.total}</span>
            <span className="inventory-pill">РќРµРёСЃРїРѕР»СЊР·РѕРІР°РЅРЅС‹Рµ: {totalStats.unused}</span>
            <span className="inventory-pill">Р РµР·РµСЂРІ: {totalStats.reserved}</span>
            <span className="inventory-pill">РСЃРїРѕР»СЊР·РѕРІР°РЅРЅС‹Рµ: {totalStats.issued}</span>
          </div>
          <button className="btn btn-secondary" disabled={backupBusy} onClick={handleCreateBackup}>
            {backupBusy ? "РћР±СЂР°Р±РѕС‚РєР°..." : "РЎРѕР·РґР°С‚СЊ Р±СЌРєР°Рї"}
          </button>
        </div>

        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table>
            <thead>
              <tr>
                <th>Р”Р°С‚Р° Р±СЌРєР°РїР°</th>
                <th>РљР»СЋС‡РµР№</th>
                <th>РљРµРј СЃРѕР·РґР°РЅ</th>
                <th>РЎРѕР·РґР°РЅ</th>
                <th>Р”РµР№СЃС‚РІРёРµ</th>
              </tr>
            </thead>
            <tbody>
              {backups.length === 0 ? (
                <tr>
                  <td colSpan={5} className="muted">
                    Р‘СЌРєР°РїС‹ РЅРµ РЅР°Р№РґРµРЅС‹
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
                        РћС‚РєР°С‚РёС‚СЊ
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
      {loading ? <div className="card">Р—Р°РіСЂСѓР·РєР° СЃРєР»Р°РґР° РєР»СЋС‡РµР№...</div> : null}

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
                      {card.sku} {card.isActive ? "" : "В· РѕС‚РєР»СЋС‡РµРЅ"}
                    </div>
                  </div>
                  <div className="inventory-counts">
                    <div>Р’СЃРµРіРѕ: {card.counts.total}</div>
                    <div>Р РµР·РµСЂРІ: {card.counts.reserved}</div>
                  </div>
                </div>

                <div className="inventory-pills-row">
                  <span className="inventory-pill">РќРµРёСЃРїРѕР»СЊР·РѕРІР°РЅРЅС‹Рµ: {card.counts.unused}</span>
                  <span className="inventory-pill">РСЃРїРѕР»СЊР·РѕРІР°РЅРЅС‹Рµ: {card.counts.issued}</span>
                </div>

                <textarea
                  className="textarea"
                  rows={4}
                  placeholder="Р’СЃС‚Р°РІСЊС‚Рµ CDK РєР»СЋС‡Рё (РїРѕ РѕРґРЅРѕРјСѓ РІ СЃС‚СЂРѕРєРµ)"
                  value={drafts[card.productId] || ""}
                  onChange={(e) => setDrafts((prev) => ({ ...prev, [card.productId]: e.target.value }))}
                  disabled={!canUpload || busyProductId === card.productId}
                />

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
                  <button className="btn btn-primary" onClick={() => handleUpload(card)} disabled={!canUpload || busyProductId === card.productId}>
                    {busyProductId === card.productId ? "Р—Р°РіСЂСѓР¶Р°РµРј..." : "Р—Р°РіСЂСѓР·РёС‚СЊ РєР»СЋС‡Рё"}
                  </button>
                  <div className="muted" style={{ fontSize: 12 }}>
                    РђРІС‚РѕРІС‹РґР°С‡Р° Р±РµСЂРµС‚ РєР»СЋС‡ С‚РѕР»СЊРєРѕ РёР· СЌС‚РѕРіРѕ С‚РѕРІР°СЂР°
                  </div>
                </div>

                <div className="inventory-sections">
                  <div className="inventory-section">
                    <div className="inventory-section-head">РќРµРёСЃРїРѕР»СЊР·РѕРІР°РЅРЅС‹Рµ Рё СЂРµР·РµСЂРІ</div>
                    <div className="table-wrap inventory-table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>CDK</th>
                            <th>РЎС‚Р°С‚СѓСЃ</th>
                            <th>Р РµР·РµСЂРІ РґРѕ</th>
                            <th>Р”РµР№СЃС‚РІРёРµ</th>
                          </tr>
                        </thead>
                        <tbody>
                          {unusedItems.length === 0 ? (
                            <tr>
                              <td colSpan={4} className="muted">
                                РќРµС‚ РєР»СЋС‡РµР№
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
                                    Р’ Р°СЂС…РёРІ
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
                    <div className="inventory-section-head">РСЃРїРѕР»СЊР·РѕРІР°РЅРЅС‹Рµ</div>
                    <div className="table-wrap inventory-table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>CDK</th>
                            <th>Telegram ID</th>
                            <th>Username</th>
                            <th>Р—Р°РєР°Р·</th>
                            <th>Р”Р°С‚Р° РІС‹РґР°С‡Рё</th>
                          </tr>
                        </thead>
                        <tbody>
                          {usedItems.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="muted">
                                РСЃРїРѕР»СЊР·РѕРІР°РЅРЅС‹С… РєР»СЋС‡РµР№ РЅРµС‚
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
                  <div>Р’ Р°СЂС…РёРІРµ: {card.archivedCount}</div>
                </div>
              </div>

              <div className="table-wrap inventory-table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>CDK</th>
                      <th>РђСЂС…РёРІРёСЂРѕРІР°РЅ</th>
                      <th>РљРµРј</th>
                      <th>Р”РµР№СЃС‚РІРёРµ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {card.items.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="muted">
                          РђСЂС…РёРІ РїСѓСЃС‚
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
                                Р’РµСЂРЅСѓС‚СЊ РІ С‚РѕРІР°СЂ
                              </button>
                              <button
                                className="btn btn-secondary"
                                disabled={!canPurge || busyItemId === item.id}
                                onClick={() => handlePurge(card, item)}
                              >
                                РЈРґР°Р»РёС‚СЊ
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
