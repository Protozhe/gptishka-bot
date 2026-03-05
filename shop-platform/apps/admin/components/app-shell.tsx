"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { apiFetch, logout } from "@/lib/api";

type AdminRole = "superadmin" | "admin" | "support";

const navItems: Array<{ href: string; label: string; roles: AdminRole[] }> = [
  { href: "/", label: "Дашборд", roles: ["superadmin", "admin", "support"] },
  { href: "/users", label: "Пользователи", roles: ["superadmin", "admin", "support"] },
  { href: "/products", label: "Товары", roles: ["superadmin", "admin", "support"] },
  { href: "/orders", label: "Заказы", roles: ["superadmin", "admin", "support"] },
  { href: "/promocodes", label: "Промокоды", roles: ["superadmin", "admin"] },
  { href: "/reviews", label: "Отзывы", roles: ["superadmin", "admin", "support"] },
  { href: "/faq", label: "FAQ", roles: ["superadmin", "admin", "support"] },
  { href: "/tickets", label: "Тикеты", roles: ["superadmin", "admin", "support"] },
  { href: "/settings", label: "Настройки", roles: ["superadmin", "admin"] },
  { href: "/logs", label: "Логи", roles: ["superadmin", "admin"] }
];

const roleMap: Record<string, string> = {
  superadmin: "Суперадмин",
  admin: "Админ",
  support: "Поддержка"
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [me, setMe] = useState<{ name: string; email: string; role: AdminRole } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<{ name: string; email: string; role: AdminRole }>("/v1/admin/auth/me")
      .then((value) => setMe(value))
      .catch(() => router.replace("/login"))
      .finally(() => setLoading(false));
  }, [router]);

  const visibleNavItems = useMemo(
    () => navItems.filter((item) => (me?.role ? item.roles.includes(me.role) : true)),
    [me?.role]
  );
  const title = useMemo(() => navItems.find((item) => item.href === pathname)?.label || "Панель", [pathname]);

  if (loading) {
    return <div style={{ padding: 24 }}>Загрузка...</div>;
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", minHeight: "100vh" }}>
      <aside
        style={{
          borderRight: "1px solid var(--line)",
          background: "rgba(7, 12, 28, 0.8)",
          padding: 18,
          position: "sticky",
          top: 0,
          height: "100vh"
        }}
      >
        <div style={{ fontWeight: 800, marginBottom: 16 }}>GPTishka Админка</div>
        <div className="muted" style={{ marginBottom: 24, fontSize: 13 }}>
          {me?.name} ({me?.role ? roleMap[me.role] || me.role : ""})
        </div>

        <nav style={{ display: "grid", gap: 8 }}>
          {visibleNavItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                background: pathname === item.href ? "rgba(34, 197, 94, 0.15)" : "transparent",
                border: pathname === item.href ? "1px solid rgba(34, 197, 94, 0.4)" : "1px solid transparent"
              }}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <button
          className="btn btn-secondary"
          style={{ marginTop: 20, width: "100%" }}
          onClick={async () => {
            await logout();
            router.replace("/login");
          }}
        >
          Выйти
        </button>
      </aside>

      <main style={{ padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h1 style={{ margin: 0, fontSize: 26 }}>{title}</h1>
          <div className="muted" style={{ fontSize: 13 }}>
            {me?.email}
          </div>
        </div>
        {children}
      </main>
    </div>
  );
}
