export interface CreatePaymentInput {
  orderId: string;
  orderNumber: number;
  amountRub: number;
  description: string;
  idempotencyKey: string;
}

export interface CreatePaymentOutput {
  providerPaymentId: string;
  paymentUrl: string;
  status: "pending" | "paid";
  raw?: unknown;
}

export interface PaymentWebhookResult {
  providerPaymentId: string;
  status: "paid" | "failed" | "pending";
  raw: unknown;
}

export interface PaymentProvider {
  name: string;
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentOutput>;
  parseWebhook(body: unknown, signatureHeader?: string): Promise<PaymentWebhookResult>;
}
