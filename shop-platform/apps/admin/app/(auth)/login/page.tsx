"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { login } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("owner@gptishka.local");
  const [password, setPassword] = useState("ChangeMe_123456");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div className="card" style={{ width: "min(460px, 100%)", padding: 28 }}>
        <h1 style={{ marginTop: 0 }}>Admin Login</h1>
        <p className="muted" style={{ marginTop: -6 }}>
          Secure access to GPTishka control panel.
        </p>

        <div className="grid" style={{ marginTop: 16 }}>
          <label>
            <div className="muted" style={{ marginBottom: 6 }}>
              Email
            </div>
            <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>

          <label>
            <div className="muted" style={{ marginBottom: 6 }}>
              Password
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
              <input
                className="input"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button type="button" className="btn btn-secondary" onClick={() => setShowPassword((v) => !v)}>
                {showPassword ? "Hide" : "Show"}
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
                setError(e instanceof Error ? e.message : "Login failed");
              } finally {
                setLoading(false);
              }
            }}
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </div>
      </div>
    </div>
  );
}
