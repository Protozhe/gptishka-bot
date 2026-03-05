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

export default function ProductsPage() {
  const [rows, setRows] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Array<{ id: string; titleRu: string }>>([]);
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
    const [products, cats] = await Promise.all([
      apiFetch<Product[]>("/v1/admin/products"),
      apiFetch<Array<{ id: string; titleRu: string }>>("/v1/admin/categories")
    ]);
    setRows(products);
    setCategories(cats);
    if (!form.categoryId && cats[0]) setForm((prev) => ({ ...prev, categoryId: cats[0].id }));
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Создание товара</h3>
        <div className="grid" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
          <select className="select" value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
            {categories.map((category) => <option key={category.id} value={category.id}>{category.titleRu}</option>)}
          </select>
          <input className="input" placeholder="SKU" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
          <input className="input" placeholder="Слаг" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} />
          <input className="input" placeholder="Название (RU)" value={form.titleRu} onChange={(e) => setForm({ ...form, titleRu: e.target.value })} />
          <input className="input" placeholder="Название (EN)" value={form.titleEn} onChange={(e) => setForm({ ...form, titleEn: e.target.value })} />
          <input className="input" type="number" value={form.priceRub} onChange={(e) => setForm({ ...form, priceRub: Number(e.target.value) })} />
          <input className="input" placeholder="Краткое описание (RU)" value={form.shortDescriptionRu} onChange={(e) => setForm({ ...form, shortDescriptionRu: e.target.value })} />
          <input className="input" placeholder="Краткое описание (EN)" value={form.shortDescriptionEn} onChange={(e) => setForm({ ...form, shortDescriptionEn: e.target.value })} />
          <input className="input" type="number" value={form.oldPriceRub} onChange={(e) => setForm({ ...form, oldPriceRub: Number(e.target.value) })} />
          <input className="input" placeholder="Полное описание (RU)" value={form.descriptionRu} onChange={(e) => setForm({ ...form, descriptionRu: e.target.value })} />
          <input className="input" placeholder="Полное описание (EN)" value={form.descriptionEn} onChange={(e) => setForm({ ...form, descriptionEn: e.target.value })} />
          <select className="select" value={form.deliveryType} onChange={(e) => setForm({ ...form, deliveryType: e.target.value })}>
            <option value="inventory">Склад (готовые ключи)</option>
            <option value="instant_token">Мгновенный токен</option>
            <option value="manual">Ручная выдача</option>
          </select>
          <input className="input" placeholder="Преимущества (RU)" value={form.advantagesRu} onChange={(e) => setForm({ ...form, advantagesRu: e.target.value })} />
          <input className="input" placeholder="Преимущества (EN)" value={form.advantagesEn} onChange={(e) => setForm({ ...form, advantagesEn: e.target.value })} />
          <input className="input" placeholder="Формат активации (RU)" value={form.activationFormatRu} onChange={(e) => setForm({ ...form, activationFormatRu: e.target.value })} />
          <input className="input" placeholder="Формат активации (EN)" value={form.activationFormatEn} onChange={(e) => setForm({ ...form, activationFormatEn: e.target.value })} />
          <input className="input" placeholder="Гарантия (RU)" value={form.guaranteeRu} onChange={(e) => setForm({ ...form, guaranteeRu: e.target.value })} />
          <input className="input" placeholder="Гарантия (EN)" value={form.guaranteeEn} onChange={(e) => setForm({ ...form, guaranteeEn: e.target.value })} />
          <input className="input" type="number" value={form.durationDays} onChange={(e) => setForm({ ...form, durationDays: Number(e.target.value) })} />
        </div>
        <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={async () => {
          await apiFetch("/v1/admin/products", { method: "POST", body: JSON.stringify({ ...form, oldPriceRub: form.oldPriceRub || null, stockCount: 100, isActive: true, sortOrder: 100, requiresManualReview: form.deliveryType === "manual" }) });
          await load();
        }}>Создать</button>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Список товаров</h3>
        <div className="table-wrap">
          <table>
            <thead><tr><th>SKU</th><th>Название</th><th>Цена</th><th>Выдача</th><th>Статус</th><th>Действие</th></tr></thead>
            <tbody>{rows.map((row) => <tr key={row.id}><td>{row.sku}</td><td>{row.titleRu}</td><td>{row.priceRub} руб.</td><td>{deliveryTypeLabels[row.deliveryType] || row.deliveryType}</td><td>{row.isActive ? "Активен" : "Отключен"}</td><td><button className="btn btn-secondary" onClick={async () => { await apiFetch(`/v1/admin/products/${row.id}`, { method: "PATCH", body: JSON.stringify({ isActive: !row.isActive }) }); await load(); }}>{row.isActive ? "Отключить" : "Включить"}</button></td></tr>)}</tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
