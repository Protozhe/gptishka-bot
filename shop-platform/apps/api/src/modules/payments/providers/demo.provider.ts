import type { CreatePaymentInput, CreatePaymentOutput, PaymentProvider, PaymentWebhookResult } from "./types";

export class DemoPaymentProvider implements PaymentProvider {
  public readonly name = "demo";

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentOutput> {
    return {
      providerPaymentId: `demo_${input.orderId}`,
      paymentUrl: `https://t.me/gptishkasupp?start=order_${input.orderNumber}`,
      status: "pending",
      raw: {
        note: "Use POST /v1/payments/demo/mark-paid in development"
      }
    };
  }

  async parseWebhook(body: unknown): Promise<PaymentWebhookResult> {
    const payload = body as { providerPaymentId?: string; status?: string };
    if (!payload?.providerPaymentId || !payload?.status) {
      throw new Error("Invalid demo webhook payload");
    }

    return {
      providerPaymentId: payload.providerPaymentId,
      status: payload.status as "paid" | "failed" | "pending",
      raw: payload
    };
  }
}
