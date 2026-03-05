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
  constructor(private readonly baseUrl: string) {}

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options?.headers || {})
      }
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `Request failed ${response.status}`);
    }

    return (await response.json()) as T;
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
    return this.request<BotProduct[]>(`/v1/bot/products?locale=${locale}`);
  }

  getProduct(id: string, locale: BotLocale) {
    return this.request<{
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
    }>(`/v1/bot/products/${id}?locale=${locale}`);
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
    return this.request<Array<{ id: string; authorName: string; text: string; rating: number; pinned: boolean }>>(
      `/v1/bot/reviews?locale=${locale}`
    );
  }

  getFaq(locale: BotLocale) {
    return this.request<Array<{ id: string; category: string; question: string; answer: string }>>(
      `/v1/bot/faq?locale=${locale}`
    );
  }

  getPrivacy(locale: BotLocale) {
    return this.request<{ text: string }>(`/v1/bot/privacy?locale=${locale}`);
  }

  getSupportLink(locale: BotLocale) {
    return this.request<{ link: string }>(`/v1/bot/support/link?locale=${locale}`);
  }

  createSupportTicket(payload: { telegramId: string; subject: string; message: string; orderId?: string }) {
    return this.request<{ ticketId: string; status: string }>("/v1/bot/support/tickets", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }
}
