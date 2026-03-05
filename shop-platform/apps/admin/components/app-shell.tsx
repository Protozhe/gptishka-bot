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
  { href: "/cdk", label: "CDK ключи", roles: ["superadmin", "admin", "support"] },
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
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="brand">
          <span className="brand-dot" />
          <span>GPTishka Админка</span>
        </div>
        <div className="muted app-user">
          <div>{me?.name}</div>
          <div className="role-pill">{me?.role ? roleMap[me.role] || me.role : ""}</div>
        </div>

        <nav className="app-nav">
          {visibleNavItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-link ${pathname === item.href ? "active" : ""}`}
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

      <main className="app-main">
        <div className="app-header">
          <h1>{title}</h1>
          <div className="muted app-email">
            {me?.email}
          </div>
        </div>
        {children}
      </main>
    </div>
  );
}
