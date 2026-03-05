import type { CreatePaymentInput, CreatePaymentOutput, PaymentProvider, PaymentWebhookResult } from "./types";

interface YooKassaResponse {
  id: string;
  status: string;
  confirmation?: {
    confirmation_url?: string;
  };
}

export class YooKassaPaymentProvider implements PaymentProvider {
  public readonly name = "yookassa";

  constructor(
    private readonly shopId: string,
    private readonly secretKey: string
  ) {}

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentOutput> {
    const auth = Buffer.from(`${this.shopId}:${this.secretKey}`).toString("base64");

    const response = await fetch("https://api.yookassa.ru/v3/payments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${auth}`,
        "Idempotence-Key": input.idempotencyKey
      },
      body: JSON.stringify({
        amount: {
          value: (input.amountRub / 100).toFixed(2),
          currency: "RUB"
        },
        capture: true,
        description: input.description,
        confirmation: {
          type: "redirect",
          return_url: "https://t.me"
        }
      })
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`YooKassa create payment failed: ${text}`);
    }

    const body = (await response.json()) as YooKassaResponse;

    return {
      providerPaymentId: body.id,
      paymentUrl: body.confirmation?.confirmation_url || "",
      status: body.status === "succeeded" ? "paid" : "pending",
      raw: body
    };
  }

  async parseWebhook(body: unknown): Promise<PaymentWebhookResult> {
    const payload = body as any;
    const object = payload?.object;
    if (!object?.id || !object?.status) {
      throw new Error("Invalid YooKassa webhook payload");
    }

    const status = object.status === "succeeded" ? "paid" : object.status === "canceled" ? "failed" : "pending";

    return {
      providerPaymentId: object.id,
      status,
      raw: payload
    };
  }
}
