"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

interface Audit {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  createdAt: string;
  adminUser?: { email: string; role: string };
}

export default function LogsPage() {
  const [rows, setRows] = useState<Audit[]>([]);

  useEffect(() => {
    apiFetch<{ items: Audit[] }>("/v1/admin/logs/audit?page=1&pageSize=100").then((data) => setRows(data.items));
  }, []);

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Audit logs</h3>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Time</th><th>Admin</th><th>Action</th><th>Resource</th><th>ID</th></tr></thead>
          <tbody>{rows.map((row) => <tr key={row.id}><td>{new Date(row.createdAt).toLocaleString()}</td><td>{row.adminUser?.email || "system"}</td><td>{row.action}</td><td>{row.resourceType}</td><td>{row.resourceId || "-"}</td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}
