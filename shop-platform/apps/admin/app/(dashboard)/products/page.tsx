"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

interface Product {
  id: string;
  titleRu: string;
  sku: string;
  priceRub: number;
  isActive: boolean;
  deliveryType: string;
}

const deliveryTypeLabels: Record<string, string> = {
  inventory: "Склад",
  instant_token: "Мгновенный токен",
  manual: "Ручная выдача"
};

function toSlug(value: string): string {
  const translitMap: Record<string, string> = {
    а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y",
    к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f",
    х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya"
  };

  const normalized = value
    .toLowerCase()
    .split("")
    .map((char) => translitMap[char] ?? char)
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");

  return normalized || "product";
}

export default function ProductsPage() {
  const [rows, setRows] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Array<{ id: string; titleRu: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [canCreate, setCanCreate] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [form, setForm] = useState({
    categoryId: "",
    sku: "",
    slug: "",
    titleRu: "",
    titleEn: "",
    shortDescriptionRu: "",
    shortDescriptionEn: "",
    descriptionRu: "",
    descriptionEn: "",
    advantagesRu: "",
    advantagesEn: "",
    activationFormatRu: "",
    activationFormatEn: "",
    guaranteeRu: "",
    guaranteeEn: "",
    durationDays: 30,
    priceRub: 1499,
    oldPriceRub: 0,
    deliveryType: "inventory"
  });

  const load = async () => {
    setLoading(true);
    setError(null);
    let loadError: string | null = null;
    try {
      const products = await apiFetch<Product[]>("/v1/admin/products");
      setRows(products);
    } catch (e) {
      loadError = e instanceof Error ? e.message : "Не удалось загрузить товары";
    }

    try {
      const cats = await apiFetch<Array<{ id: string; titleRu: string }>>("/v1/admin/categories");
      setCategories(cats);
      setCanCreate(true);
      if (!form.categoryId && cats[0]) setForm((prev) => ({ ...prev, categoryId: cats[0].id }));
    } catch (e) {
      setCanCreate(false);
      setCategories([]);
      if (!loadError) loadError = e instanceof Error ? e.message : "Нет доступа к категориям";
    } finally {
      if (loadError) setError(loadError);
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    setError(null);
    setSuccess(null);

    if (!canCreate) {
      setError("Недостаточно прав для создания товара.");
      return;
    }

    const missing = [
      !form.categoryId && "Категория",
      form.titleRu.trim().length < 2 && "Название (RU)",
      form.shortDescriptionRu.trim().length < 2 && "Краткое описание (RU)",
      form.descriptionRu.trim().length < 2 && "Полное описание (RU)",
      form.advantagesRu.trim().length < 2 && "Преимущества (RU)",
      form.activationFormatRu.trim().length < 2 && "Формат активации (RU)",
      form.guaranteeRu.trim().length < 2 && "Гарантия (RU)",
      form.durationDays <= 0 && "Срок (дни)",
      form.priceRub <= 0 && "Цена"
    ].filter(Boolean) as string[];

    if (missing.length > 0) {
      setError(`Заполните поля: ${missing.join(", ")}`);
      return;
    }

    setSubmitting(true);
    try {
      const suffix = Date.now().toString().slice(-6);
      const generatedSku = form.sku.trim().toUpperCase() || `PRD-${suffix}`;
      const generatedSlug = form.slug.trim() || `${toSlug(form.titleEn.trim() || form.titleRu.trim())}-${suffix}`;

      const payload = {
        ...form,
        sku: generatedSku,
        slug: generatedSlug,
        titleEn: form.titleEn.trim() || form.titleRu.trim(),
        shortDescriptionEn: form.shortDescriptionEn.trim() || form.shortDescriptionRu.trim(),
        descriptionEn: form.descriptionEn.trim() || form.descriptionRu.trim(),
        advantagesEn: form.advantagesEn.trim() || form.advantagesRu.trim(),
        activationFormatEn: form.activationFormatEn.trim() || form.activationFormatRu.trim(),
        guaranteeEn: form.guaranteeEn.trim() || form.guaranteeRu.trim(),
        oldPriceRub: form.oldPriceRub > 0 ? form.oldPriceRub : null,
        stockCount: 100,
        isActive: true,
        sortOrder: 100,
        requiresManualReview: form.deliveryType === "manual"
      };

      await apiFetch("/v1/admin/products", { method: "POST", body: JSON.stringify(payload) });
      setSuccess("Товар успешно создан.");
      setForm((prev) => ({
        ...prev,
        sku: "",
        slug: "",
        titleRu: "",
        titleEn: "",
        shortDescriptionRu: "",
        shortDescriptionEn: "",
        descriptionRu: "",
        descriptionEn: "",
        advantagesRu: "",
        advantagesEn: "",
        activationFormatRu: "",
        activationFormatEn: "",
        guaranteeRu: "",
        guaranteeEn: "",
        oldPriceRub: 0
      }));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось создать товар");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Создание товара</h3>
        {!canCreate ? (
          <div style={{ marginBottom: 12, color: "#fecaca", border: "1px solid rgba(239,68,68,.4)", borderRadius: 10, padding: 10 }}>
            Недостаточно прав для создания товара (нужна роль admin/superadmin).
          </div>
        ) : null}
        {error ? (
          <div style={{ marginBottom: 12, color: "#fecaca", border: "1px solid rgba(239,68,68,.4)", borderRadius: 10, padding: 10 }}>
            {error}
          </div>
        ) : null}
        {success ? (
          <div style={{ marginBottom: 12, color: "#bbf7d0", border: "1px solid rgba(34,197,94,.4)", borderRadius: 10, padding: 10 }}>
            {success}
          </div>
        ) : null}
        <div className="grid" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
          <select className="select" value={form.categoryId} disabled={!canCreate || loading} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
            {categories.map((category) => <option key={category.id} value={category.id}>{category.titleRu}</option>)}
          </select>
          <input className="input" disabled={!canCreate || loading} placeholder="SKU (необязательно, генерируется автоматически)" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
          <input className="input" disabled={!canCreate || loading} placeholder="Слаг (необязательно, генерируется автоматически)" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} />
          <input className="input" disabled={!canCreate || loading} placeholder="Название (RU)" value={form.titleRu} onChange={(e) => setForm({ ...form, titleRu: e.target.value })} />
          <input className="input" disabled={!canCreate || loading} placeholder="Название (EN, необязательно)" value={form.titleEn} onChange={(e) => setForm({ ...form, titleEn: e.target.value })} />
          <input className="input" disabled={!canCreate || loading} type="number" value={form.priceRub} onChange={(e) => setForm({ ...form, priceRub: Number(e.target.value) })} />
          <input className="input" disabled={!canCreate || loading} placeholder="Краткое описание (RU)" value={form.shortDescriptionRu} onChange={(e) => setForm({ ...form, shortDescriptionRu: e.target.value })} />
          <input className="input" disabled={!canCreate || loading} placeholder="Краткое описание (EN, необязательно)" value={form.shortDescriptionEn} onChange={(e) => setForm({ ...form, shortDescriptionEn: e.target.value })} />
          <input className="input" disabled={!canCreate || loading} type="number" value={form.oldPriceRub} onChange={(e) => setForm({ ...form, oldPriceRub: Number(e.target.value) })} />
          <input className="input" disabled={!canCreate || loading} placeholder="Полное описание (RU)" value={form.descriptionRu} onChange={(e) => setForm({ ...form, descriptionRu: e.target.value })} />
          <input className="input" disabled={!canCreate || loading} placeholder="Полное описание (EN, необязательно)" value={form.descriptionEn} onChange={(e) => setForm({ ...form, descriptionEn: e.target.value })} />
          <select className="select" disabled={!canCreate || loading} value={form.deliveryType} onChange={(e) => setForm({ ...form, deliveryType: e.target.value })}>
            <option value="inventory">Склад (готовые ключи)</option>
            <option value="instant_token">Мгновенный токен</option>
            <option value="manual">Ручная выдача</option>
          </select>
          <input className="input" disabled={!canCreate || loading} placeholder="Преимущества (RU)" value={form.advantagesRu} onChange={(e) => setForm({ ...form, advantagesRu: e.target.value })} />
          <input className="input" disabled={!canCreate || loading} placeholder="Преимущества (EN, необязательно)" value={form.advantagesEn} onChange={(e) => setForm({ ...form, advantagesEn: e.target.value })} />
          <input className="input" disabled={!canCreate || loading} placeholder="Формат активации (RU)" value={form.activationFormatRu} onChange={(e) => setForm({ ...form, activationFormatRu: e.target.value })} />
          <input className="input" disabled={!canCreate || loading} placeholder="Формат активации (EN, необязательно)" value={form.activationFormatEn} onChange={(e) => setForm({ ...form, activationFormatEn: e.target.value })} />
          <input className="input" disabled={!canCreate || loading} placeholder="Гарантия (RU)" value={form.guaranteeRu} onChange={(e) => setForm({ ...form, guaranteeRu: e.target.value })} />
          <input className="input" disabled={!canCreate || loading} placeholder="Гарантия (EN, необязательно)" value={form.guaranteeEn} onChange={(e) => setForm({ ...form, guaranteeEn: e.target.value })} />
          <input className="input" disabled={!canCreate || loading} type="number" value={form.durationDays} onChange={(e) => setForm({ ...form, durationDays: Number(e.target.value) })} />
        </div>
        <button className="btn btn-primary" disabled={!canCreate || submitting || loading} style={{ marginTop: 12 }} onClick={handleCreate}>
          {submitting ? "Создаем..." : "Создать"}
        </button>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Список товаров</h3>
        <div className="table-wrap">
          <table>
            <thead><tr><th>SKU</th><th>Название</th><th>Цена</th><th>Выдача</th><th>Статус</th><th>Действие</th></tr></thead>
            <tbody>{rows.map((row) => <tr key={row.id}><td>{row.sku}</td><td>{row.titleRu}</td><td>{row.priceRub} руб.</td><td>{deliveryTypeLabels[row.deliveryType] || row.deliveryType}</td><td>{row.isActive ? "Активен" : "Отключен"}</td><td><button className="btn btn-secondary" onClick={async () => {
              setError(null);
              setSuccess(null);
              try {
                await apiFetch(`/v1/admin/products/${row.id}`, { method: "PATCH", body: JSON.stringify({ isActive: !row.isActive }) });
                setSuccess(row.isActive ? "Товар отключен." : "Товар включен.");
                await load();
              } catch (e) {
                setError(e instanceof Error ? e.message : "Не удалось изменить статус товара");
              }
            }}>{row.isActive ? "Отключить" : "Включить"}</button></td></tr>)}</tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
