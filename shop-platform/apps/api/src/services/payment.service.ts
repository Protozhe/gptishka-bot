import { PaymentStatus, type PrismaClient } from "@prisma/client";
import { createIdempotencyKey } from "../lib/idempotency";
import { badRequest, notFound } from "../lib/http-error";
import type { PaymentProvider } from "../modules/payments/providers/types";
import { markOrderPaidAndDeliver } from "./order.service";

export async function createPaymentForOrder(params: {
  prisma: PrismaClient;
  provider: PaymentProvider;
  orderId: string;
}): Promise<{ paymentId: string; providerPaymentId: string; paymentUrl: string; status: PaymentStatus }> {
  const { prisma, provider, orderId } = params;

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) {
    throw notFound("Order not found");
  }

  if (!["pending_payment", "paid"].includes(order.status)) {
    throw badRequest("Order cannot be paid in current status");
  }

  const existing = await prisma.payment.findUnique({ where: { orderId } });
  if (existing && existing.status !== PaymentStatus.failed && existing.status !== PaymentStatus.canceled) {
    return {
      paymentId: existing.id,
      providerPaymentId: existing.providerPaymentId || "",
      paymentUrl: (existing.payload as any)?.paymentUrl || "",
      status: existing.status
    };
  }

  const idempotencyKey = createIdempotencyKey("payment");
  const result = await provider.createPayment({
    orderId: order.id,
    orderNumber: order.orderNumber,
    amountRub: order.amountRub,
    description: `Order #${order.orderNumber}`,
    idempotencyKey
  });

  const status = result.status === "paid" ? PaymentStatus.paid : PaymentStatus.pending;

  const payment = await prisma.payment.upsert({
    where: { orderId: order.id },
    update: {
      provider: provider.name,
      providerPaymentId: result.providerPaymentId,
      status,
      payload: {
        raw: result.raw,
        paymentUrl: result.paymentUrl
      } as any
    },
    create: {
      orderId: order.id,
      provider: provider.name,
      providerPaymentId: result.providerPaymentId,
      amountRub: order.amountRub,
      status,
      payload: {
        raw: result.raw,
        paymentUrl: result.paymentUrl
      } as any,
      idempotencyKey
    }
  });

  if (status === PaymentStatus.paid) {
    await markOrderPaidAndDeliver(prisma, order.id);
  }

  return {
    paymentId: payment.id,
    providerPaymentId: payment.providerPaymentId || "",
    paymentUrl: result.paymentUrl,
    status: payment.status
  };
}

export async function processPaymentWebhook(params: {
  prisma: PrismaClient;
  provider: PaymentProvider;
  body: unknown;
  signatureHeader?: string;
}): Promise<{ ok: boolean }> {
  const { prisma, provider, body, signatureHeader } = params;

  const parsed = await provider.parseWebhook(body, signatureHeader);

  const payment = await prisma.payment.findFirst({
    where: {
      provider: provider.name,
      providerPaymentId: parsed.providerPaymentId
    }
  });

  if (!payment) {
    throw notFound("Payment not found");
  }

  if (parsed.status === "paid") {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: PaymentStatus.paid, paidAt: new Date(), payload: parsed.raw as any }
    });

    await markOrderPaidAndDeliver(prisma, payment.orderId);
  }

  if (parsed.status === "failed") {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: PaymentStatus.failed, payload: parsed.raw as any }
    });

    await prisma.order.update({
      where: { id: payment.orderId },
      data: { status: "error", errorReason: "Payment failed" }
    });
  }

  return { ok: true };
}
