export type BotLocale = "ru" | "en";

export interface BotProduct {
  id: string;
  name: string;
  shortDescription: string;
  durationDays: number;
  priceRub: number;
  oldPriceRub: number | null;
  benefitRub: number | null;
  deliveryType: string;
}

export interface BotOrder {
  orderId: string;
  orderNumber: number;
  productName: string;
  amountRub: number;
  date: string;
  status: string;
  deliveryContent?: string;
  instruction?: string;
}

export class ApiClient {
  private readonly cache = new Map<string, { expiresAt: number; value: unknown }>();
  private readonly inFlight = new Map<string, Promise<unknown>>();

  constructor(private readonly baseUrl: string) {}

  private getCached<T>(key: string): T | undefined {
    const cached = this.cache.get(key);
    if (!cached) return undefined;
    if (cached.expiresAt <= Date.now()) {
      this.cache.delete(key);
      return undefined;
    }
    return cached.value as T;
  }

  private setCached<T>(key: string, value: T, ttlMs: number): void {
    if (ttlMs <= 0) return;
    this.cache.set(key, {
      expiresAt: Date.now() + ttlMs,
      value
    });
  }

  private async request<T>(path: string, options?: RequestInit, timeoutMs = 8000): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const headers = new Headers(options?.headers || {});
    headers.set("Accept", "application/json");
    if (options?.body != null && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        ...options,
        headers,
        signal: controller.signal
      });
    } catch (error) {
      if ((error as { name?: string })?.name === "AbortError") {
        throw new Error("Request timeout");
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `Request failed ${response.status}`);
    }

    return (await response.json()) as T;
  }

  private async requestCached<T>(key: string, path: string, ttlMs: number): Promise<T> {
    const cached = this.getCached<T>(key);
    if (cached !== undefined) {
      return cached;
    }

    const pending = this.inFlight.get(key) as Promise<T> | undefined;
    if (pending) {
      return pending;
    }

    const promise = this.request<T>(path)
      .then((value) => {
        this.setCached(key, value, ttlMs);
        return value;
      })
      .finally(() => {
        this.inFlight.delete(key);
      });

    this.inFlight.set(key, promise);
    return promise;
  }

  start(payload: {
    telegramId: string;
    username?: string;
    firstName?: string;
    lastName?: string;
    locale?: BotLocale;
    startPayload?: string;
  }) {
    return this.request<{
      user: { telegramId: string; locale: BotLocale };
      hero: { title: string; subtitle: string };
      menu: Record<string, string>;
    }>("/v1/bot/start", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  setLanguage(payload: { telegramId: string; locale: BotLocale }) {
    return this.request<{ telegramId: string; locale: BotLocale }>("/v1/bot/language", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  getProducts(locale: BotLocale) {
    return this.requestCached<BotProduct[]>(`products:${locale}`, `/v1/bot/products?locale=${locale}`, 15_000);
  }

  getProduct(id: string, locale: BotLocale) {
    return this.requestCached<{
      id: string;
      name: string;
      description: string;
      advantages: string;
      durationDays: number;
      activationFormat: string;
      guarantee: string;
      priceRub: number;
      oldPriceRub: number | null;
      actions: {
        applyPromo: string;
        pay: string;
        back: string;
      };
    }>(`product:${id}:${locale}`, `/v1/bot/products/${id}?locale=${locale}`, 15_000);
  }

  validatePromo(payload: { telegramId: string; productId: string; promoCode: string }) {
    return this.request<{
      promoCode: string;
      initialAmountRub: number;
      discountAmountRub: number;
      finalAmountRub: number;
      discountPercent: number;
    }>("/v1/bot/promos/validate", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  createOrder(payload: { telegramId: string; productId: string; promoCode?: string }) {
    return this.request<{
      orderId: string;
      orderNumber: number;
      amountRub: number;
      initialAmountRub: number;
      discountAmountRub: number;
      promoCode?: string;
    }>("/v1/bot/orders", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  createPayment(payload: { orderId: string; telegramId: string }) {
    return this.request<{
      paymentId: string;
      providerPaymentId: string;
      paymentUrl: string;
      status: string;
    }>(`/v1/bot/orders/${payload.orderId}/pay`, {
      method: "POST",
      body: JSON.stringify({ telegramId: payload.telegramId })
    });
  }

  getMyOrders(telegramId: string) {
    return this.request<BotOrder[]>(`/v1/bot/orders/my/${telegramId}`);
  }

  getReviews(locale: BotLocale) {
    return this.requestCached<Array<{ id: string; authorName: string; text: string; rating: number; pinned: boolean }>>(
      `reviews:${locale}`,
      `/v1/bot/reviews?locale=${locale}`,
      45_000
    );
  }

  getFaq(locale: BotLocale) {
    return this.requestCached<Array<{ id: string; category: string; question: string; answer: string }>>(
      `faq:${locale}`,
      `/v1/bot/faq?locale=${locale}`,
      45_000
    );
  }

  getPrivacy(locale: BotLocale) {
    return this.requestCached<{ text: string }>(`privacy:${locale}`, `/v1/bot/privacy?locale=${locale}`, 300_000);
  }

  getSupportLink(locale: BotLocale) {
    return this.requestCached<{ link: string }>(`support-link:${locale}`, `/v1/bot/support/link?locale=${locale}`, 300_000);
  }

  createSupportTicket(payload: { telegramId: string; subject: string; message: string; orderId?: string }) {
    return this.request<{ ticketId: string; status: string }>("/v1/bot/support/tickets", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }
}
