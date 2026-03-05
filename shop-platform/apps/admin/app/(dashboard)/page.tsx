"use client";

import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { apiFetch } from "@/lib/api";

interface DashboardResponse {
  kpis: {
    usersTotal: number;
    usersDay: number;
    ordersTotal: number;
    paidTotal: number;
    pendingCount: number;
    issuedCount: number;
    activePromos: number;
    problematicOrders: number;
    revenueDay: number;
    revenueWeek: number;
    revenueMonth: number;
  };
  topProducts: Array<{ productId: string; name: string; orders: number }>;
  promoConversion: Array<{ promoCodeId: string; code: string; uses: number; totalDiscountRub: number }>;
  latestAudit: Array<{ id: string; action: string; resourceType: string; createdAt: string }>;
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<DashboardResponse>("/v1/admin/dashboard")
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Не удалось загрузить данные"));
  }, []);

  const revenueData = useMemo(
    () =>
      data
        ? [
            { name: "24ч", value: data.kpis.revenueDay },
            { name: "7д", value: data.kpis.revenueWeek },
            { name: "30д", value: data.kpis.revenueMonth }
          ]
        : [],
    [data]
  );

  if (error) return <div className="card">{error}</div>;
  if (!data) return <div className="card">Загрузка дашборда...</div>;

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="kpi-grid">
        <div className="card"><div className="muted">Всего пользователей</div><div style={{ fontSize: 28, fontWeight: 700 }}>{data.kpis.usersTotal}</div></div>
        <div className="card"><div className="muted">Новых за 24ч</div><div style={{ fontSize: 28, fontWeight: 700 }}>{data.kpis.usersDay}</div></div>
        <div className="card"><div className="muted">Всего заказов</div><div style={{ fontSize: 28, fontWeight: 700 }}>{data.kpis.ordersTotal}</div></div>
        <div className="card"><div className="muted">Оплачено заказов</div><div style={{ fontSize: 28, fontWeight: 700 }}>{data.kpis.paidTotal}</div></div>
        <div className="card"><div className="muted">Ожидают оплаты</div><div style={{ fontSize: 28, fontWeight: 700 }}>{data.kpis.pendingCount}</div></div>
        <div className="card"><div className="muted">Выдано</div><div style={{ fontSize: 28, fontWeight: 700 }}>{data.kpis.issuedCount}</div></div>
        <div className="card"><div className="muted">Активные промокоды</div><div style={{ fontSize: 28, fontWeight: 700 }}>{data.kpis.activePromos}</div></div>
        <div className="card"><div className="muted">Проблемные заказы</div><div style={{ fontSize: 28, fontWeight: 700, color: "#fca5a5" }}>{data.kpis.problematicOrders}</div></div>
      </div>

      <div className="card" style={{ height: 280 }}>
        <div style={{ marginBottom: 10, fontWeight: 600 }}>Выручка (руб.)</div>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={revenueData}>
            <XAxis dataKey="name" stroke="#a7b1d3" />
            <YAxis stroke="#a7b1d3" />
            <Tooltip />
            <Bar dataKey="value" fill="#22c55e" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Топ товаров</h3>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Товар</th><th>Заказы</th></tr></thead>
              <tbody>{data.topProducts.map((row) => <tr key={row.productId}><td>{row.name}</td><td>{row.orders}</td></tr>)}</tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Конверсия промокодов</h3>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Промокод</th><th>Использований</th><th>Сумма скидок</th></tr></thead>
              <tbody>{data.promoConversion.map((row) => <tr key={row.promoCodeId}><td>{row.code}</td><td>{row.uses}</td><td>{row.totalDiscountRub} руб.</td></tr>)}</tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Последние действия</h3>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Действие</th><th>Ресурс</th><th>Время</th></tr></thead>
            <tbody>{data.latestAudit.map((row) => <tr key={row.id}><td>{row.action}</td><td>{row.resourceType}</td><td>{new Date(row.createdAt).toLocaleString()}</td></tr>)}</tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
