import type { PrismaClient } from "@prisma/client";
import { OrderStatus } from "@prisma/client";
import { createIdempotencyKey } from "../lib/idempotency";
import { badRequest, notFound } from "../lib/http-error";
import { validatePromoForOrder } from "./promo.service";
import { deliverOrder } from "./delivery.service";

export async function ensureUserByTelegramId(
  prisma: PrismaClient,
  params: {
    telegramId: string;
    username?: string;
    firstName?: string;
    lastName?: string;
    locale?: "ru" | "en";
    startPayload?: string;
  }
) {
  const telegramId = params.telegramId.trim();
  if (!telegramId) {
    throw badRequest("telegramId is required");
  }

  const user = await prisma.user.upsert({
    where: { telegramId },
    update: {
      username: params.username,
      firstName: params.firstName,
      lastName: params.lastName,
      locale: params.locale,
      firstStartPayload: params.startPayload ?? undefined
    },
    create: {
      telegramId,
      username: params.username,
      firstName: params.firstName,
      lastName: params.lastName,
      locale: params.locale,
      firstStartPayload: params.startPayload,
      refCode: params.startPayload ?? undefined
    }
  });

  return user;
}

export async function createOrderDraft(params: {
  prisma: PrismaClient;
  telegramId: string;
  productId: string;
  promoCode?: string;
}): Promise<{
  orderId: string;
  orderNumber: number;
  amountRub: number;
  initialAmountRub: number;
  discountAmountRub: number;
  promoCode?: string;
}> {
  const { prisma, telegramId, productId, promoCode } = params;

  const user = await prisma.user.findUnique({ where: { telegramId } });
  if (!user) {
    throw notFound("User not found");
  }

  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product || !product.isActive) {
    throw notFound("Товар недоступен");
  }

  const price = await validatePromoForOrder({
    prisma,
    userId: user.id,
    productId,
    amountRub: product.priceRub,
    promoCode
  });

  const order = await prisma.order.create({
    data: {
      userId: user.id,
      productId,
      status: OrderStatus.pending_payment,
      initialAmountRub: price.initialAmount,
      amountRub: price.finalAmount,
      discountAmountRub: price.discountAmount,
      promoCodeId: price.promoId,
      promoCodeText: price.promoCode,
      paymentDueAt: new Date(Date.now() + 1000 * 60 * 30),
      idempotencyKey: createIdempotencyKey("order")
    }
  });

  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    amountRub: order.amountRub,
    initialAmountRub: order.initialAmountRub,
    discountAmountRub: order.discountAmountRub,
    promoCode: order.promoCodeText ?? undefined
  };
}

export async function markOrderPaidAndDeliver(prisma: PrismaClient, orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) {
    throw notFound("Order not found");
  }

  if (order.status === OrderStatus.issued || order.status === OrderStatus.processing) {
    return;
  }

  if (order.status !== OrderStatus.pending_payment && order.status !== OrderStatus.paid) {
    throw badRequest("Order status does not allow payment confirmation");
  }

  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: order.id },
      data: {
        status: OrderStatus.paid,
        paidAt: new Date()
      }
    });

    if (order.promoCodeId) {
      const usageExists = await tx.promoCodeUsage.findFirst({
        where: {
          orderId: order.id,
          promoCodeId: order.promoCodeId,
          userId: order.userId
        }
      });

      if (!usageExists) {
        await tx.promoCodeUsage.create({
          data: {
            promoCodeId: order.promoCodeId,
            userId: order.userId,
            orderId: order.id,
            discountAmount: order.discountAmountRub
          }
        });
      }
    }
  });

  await deliverOrder(prisma, order.id);
}
