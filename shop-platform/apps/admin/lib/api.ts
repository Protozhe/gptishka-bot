"use client";

import { clearToken, getToken, setToken } from "./auth";

const API_BASE = "/api_proxy";

function normalizeApiError(raw: string, status: number): string {
  const message = (raw || "").toLowerCase();
  if (message.includes("unique constraint failed")) {
    return "РўР°РєРѕРµ Р·РЅР°С‡РµРЅРёРµ СѓР¶Рµ СЃСѓС‰РµСЃС‚РІСѓРµС‚ (РґСѓР±Р»РёРєР°С‚). РР·РјРµРЅРёС‚Рµ РєРѕРґ РёР»Рё СЃР»Р°Рі.";
  }
  if (status === 401 || message.includes("unauthorized") || message.includes("jwt")) {
    return "РЎРµСЃСЃРёСЏ РёСЃС‚РµРєР»Р°. Р’РѕР№РґРёС‚Рµ СЃРЅРѕРІР°.";
  }
  if (status === 403 || message.includes("forbidden")) {
    return "РќРµРґРѕСЃС‚Р°С‚РѕС‡РЅРѕ РїСЂР°РІ РґР»СЏ СЌС‚РѕРіРѕ РґРµР№СЃС‚РІРёСЏ.";
  }
  if (status === 404 || message.includes("not found")) {
    return "РћР±СЉРµРєС‚ РЅРµ РЅР°Р№РґРµРЅ.";
  }
  if (status === 400 || message.includes("validation") || message.includes("invalid")) {
    return raw || "РџСЂРѕРІРµСЂСЊС‚Рµ РєРѕСЂСЂРµРєС‚РЅРѕСЃС‚СЊ Р·Р°РїРѕР»РЅРµРЅРёСЏ РїРѕР»РµР№.";
  }
  return raw || `РћС€РёР±РєР° Р·Р°РїСЂРѕСЃР° (${status})`;
}

export async function apiFetch<T>(path: string, init?: RequestInit, auth = true): Promise<T> {
  const headers = new Headers(init?.headers || {});
  headers.set("Accept", "application/json");

  const body = init?.body;
  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;
  if (body != null && !isFormData && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

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
    throw new Error("РЎРµСЃСЃРёСЏ РёСЃС‚РµРєР»Р°. Р’РѕР№РґРёС‚Рµ СЃРЅРѕРІР°.");
  }

  if (!response.ok) {
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const payload = (await response.json()) as { message?: string; error?: string };
      throw new Error(normalizeApiError(payload?.message || payload?.error || "", response.status));
    }
    const text = await response.text();
    const normalized = text?.trim();
    throw new Error(normalizeApiError(normalized, response.status));
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
