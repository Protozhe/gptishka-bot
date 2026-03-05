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
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"));
  }, []);

  const revenueData = useMemo(
    () =>
      data
        ? [
            { name: "24h", value: data.kpis.revenueDay },
            { name: "7d", value: data.kpis.revenueWeek },
            { name: "30d", value: data.kpis.revenueMonth }
          ]
        : [],
    [data]
  );

  if (error) return <div className="card">{error}</div>;
  if (!data) return <div className="card">Loading dashboard...</div>;

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="kpi-grid">
        <div className="card"><div className="muted">Users total</div><div style={{ fontSize: 28, fontWeight: 700 }}>{data.kpis.usersTotal}</div></div>
        <div className="card"><div className="muted">New users (24h)</div><div style={{ fontSize: 28, fontWeight: 700 }}>{data.kpis.usersDay}</div></div>
        <div className="card"><div className="muted">Orders total</div><div style={{ fontSize: 28, fontWeight: 700 }}>{data.kpis.ordersTotal}</div></div>
        <div className="card"><div className="muted">Paid orders</div><div style={{ fontSize: 28, fontWeight: 700 }}>{data.kpis.paidTotal}</div></div>
        <div className="card"><div className="muted">Pending</div><div style={{ fontSize: 28, fontWeight: 700 }}>{data.kpis.pendingCount}</div></div>
        <div className="card"><div className="muted">Issued</div><div style={{ fontSize: 28, fontWeight: 700 }}>{data.kpis.issuedCount}</div></div>
        <div className="card"><div className="muted">Active promos</div><div style={{ fontSize: 28, fontWeight: 700 }}>{data.kpis.activePromos}</div></div>
        <div className="card"><div className="muted">Problematic</div><div style={{ fontSize: 28, fontWeight: 700, color: "#fca5a5" }}>{data.kpis.problematicOrders}</div></div>
      </div>

      <div className="card" style={{ height: 280 }}>
        <div style={{ marginBottom: 10, fontWeight: 600 }}>Revenue (RUB)</div>
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
          <h3 style={{ marginTop: 0 }}>Top products</h3>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Product</th><th>Orders</th></tr></thead>
              <tbody>{data.topProducts.map((row) => <tr key={row.productId}><td>{row.name}</td><td>{row.orders}</td></tr>)}</tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Promo conversion</h3>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Promo</th><th>Uses</th><th>Discount</th></tr></thead>
              <tbody>{data.promoConversion.map((row) => <tr key={row.promoCodeId}><td>{row.code}</td><td>{row.uses}</td><td>{row.totalDiscountRub} ₽</td></tr>)}</tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Latest audit</h3>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Action</th><th>Resource</th><th>Created</th></tr></thead>
            <tbody>{data.latestAudit.map((row) => <tr key={row.id}><td>{row.action}</td><td>{row.resourceType}</td><td>{new Date(row.createdAt).toLocaleString()}</td></tr>)}</tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
