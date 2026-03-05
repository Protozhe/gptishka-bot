"use client";

import { clearToken, getToken, setToken } from "./auth";

const API_BASE = "/api_proxy";

export async function apiFetch<T>(path: string, init?: RequestInit, auth = true): Promise<T> {
  const headers = new Headers(init?.headers || {});
  headers.set("Content-Type", "application/json");

  if (auth) {
    const token = getToken();
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
    credentials: "include"
  });

  if (response.status === 401 && auth) {
    const refreshed = await refreshToken();
    if (refreshed) {
      return apiFetch(path, init, auth);
    }
    clearToken();
    throw new Error("Сессия истекла. Войдите снова.");
  }

  if (!response.ok) {
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const payload = (await response.json()) as { message?: string };
      throw new Error(payload?.message || `Ошибка запроса (${response.status})`);
    }
    const text = await response.text();
    const normalized = text?.trim();
    throw new Error(normalized || `Ошибка запроса (${response.status})`);
  }

  if (response.status === 204) {
    return {} as T;
  }

  return (await response.json()) as T;
}

async function refreshToken(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/v1/admin/auth/refresh`, {
      method: "POST",
      credentials: "include"
    });

    if (!response.ok) return false;
    const data = (await response.json()) as { accessToken: string };
    setToken(data.accessToken);
    return true;
  } catch {
    return false;
  }
}

export async function login(email: string, password: string) {
  const data = await apiFetch<{ accessToken: string; admin: { id: string; email: string; name: string; role: string } }>(
    "/v1/admin/auth/login",
    {
      method: "POST",
      body: JSON.stringify({ email, password })
    },
    false
  );

  setToken(data.accessToken);
  return data.admin;
}

export async function logout() {
  await apiFetch("/v1/admin/auth/logout", { method: "POST" });
  clearToken();
}
