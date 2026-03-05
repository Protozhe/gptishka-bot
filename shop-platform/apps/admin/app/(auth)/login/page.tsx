"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { login } from "@/lib/api";

function mapLoginError(raw: string): string {
  const message = raw.toLowerCase();
  if (message.includes("failed to fetch") || message.includes("networkerror")) {
    return "Не удалось подключиться к серверу. Проверьте API и прокси.";
  }
  if (message.includes("unauthorized") || message.includes("invalid credentials") || message.includes("forbidden")) {
    return "Неверная почта или пароль.";
  }
  if (message.includes("request failed")) {
    return "Ошибка входа. Попробуйте еще раз.";
  }
  return raw;
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("owner@gptishka.local");
  const [password, setPassword] = useState("ChangeMe_123456");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="auth-wrap">
      <div className="card auth-card">
        <h1>Вход в админку</h1>
        <p className="muted">
          Безопасный вход в панель управления GPTishka.
        </p>

        <div className="grid auth-grid">
          <label className="field">
            <div className="muted field-label">
              Почта
            </div>
            <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>

          <label className="field">
            <div className="muted field-label">
              Пароль
            </div>
            <div className="password-row">
              <input
                className="input"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button type="button" className="btn btn-secondary" onClick={() => setShowPassword((v) => !v)}>
                {showPassword ? "Скрыть" : "Показать"}
              </button>
            </div>
          </label>

          {error ? (
            <div style={{ color: "#fecaca", border: "1px solid rgba(239,68,68,.4)", borderRadius: 10, padding: 10 }}>{error}</div>
          ) : null}

          <button
            className="btn btn-primary"
            disabled={loading}
            onClick={async () => {
              setLoading(true);
              setError(null);
              try {
                await login(email, password);
                router.replace("/");
              } catch (e) {
                setError(e instanceof Error ? mapLoginError(e.message) : "Ошибка входа");
              } finally {
                setLoading(false);
              }
            }}
          >
            {loading ? "Входим..." : "Войти"}
          </button>
        </div>
      </div>
    </div>
  );
}
