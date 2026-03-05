import type { PrismaClient } from "@prisma/client";
import { PromoType } from "@prisma/client";
import { badRequest } from "../lib/http-error";

export interface PromoValidationResult {
  promoId?: string;
  promoCode?: string;
  discountAmount: number;
  finalAmount: number;
  initialAmount: number;
}

export async function validatePromoForOrder(params: {
  prisma: PrismaClient;
  userId: string;
  productId: string;
  amountRub: number;
  promoCode?: string;
}): Promise<PromoValidationResult> {
  const { prisma, userId, productId, amountRub, promoCode } = params;

  if (!promoCode) {
    return {
      discountAmount: 0,
      finalAmount: amountRub,
      initialAmount: amountRub
    };
  }

  const code = promoCode.trim().toUpperCase();

  const promo = await prisma.promoCode.findUnique({
    where: { code },
    include: { products: true }
  });

  if (!promo || !promo.isActive) {
    throw badRequest("Промокод не найден или отключен");
  }

  if (promo.expiresAt && promo.expiresAt < new Date()) {
    throw badRequest("Промокод истек");
  }

  if (promo.products.length > 0 && !promo.products.some((p) => p.productId === productId)) {
    throw badRequest("Промокод не действует на выбранный товар");
  }

  if (promo.maxActivations !== null) {
    const totalUsages = await prisma.promoCodeUsage.count({ where: { promoCodeId: promo.id } });
    if (totalUsages >= promo.maxActivations) {
      throw badRequest("Лимит активаций промокода исчерпан");
    }
  }

  if (promo.onlyNewUsers) {
    const hasPaidOrders = await prisma.order.count({
      where: {
        userId,
        status: { in: ["paid", "issued", "processing"] }
      }
    });

    if (hasPaidOrders > 0) {
      throw badRequest("Промокод доступен только новым клиентам");
    }
  }

  if (promo.perUserLimit !== null || promo.isOneTime) {
    const userUsages = await prisma.promoCodeUsage.count({
      where: {
        promoCodeId: promo.id,
        userId
      }
    });

    const limit = promo.isOneTime ? 1 : promo.perUserLimit;
    if (limit !== null && userUsages >= limit) {
      throw badRequest("Промокод уже использован максимальное количество раз");
    }
  }

  const discountAmount =
    promo.type === PromoType.percent
      ? Math.round((amountRub * promo.value) / 100)
      : Math.min(amountRub, promo.value);

  const finalAmount = Math.max(1, amountRub - discountAmount);

  return {
    promoId: promo.id,
    promoCode: promo.code,
    discountAmount,
    finalAmount,
    initialAmount: amountRub
  };
}
