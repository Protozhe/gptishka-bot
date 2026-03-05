import { DeliveryType, OrderStatus, PrismaClient } from "@prisma/client";
import { createIdempotencyKey } from "../lib/idempotency";
import { badRequest, notFound } from "../lib/http-error";

export interface DeliveryResult {
  status: OrderStatus;
  content?: string;
  instructionRu?: string;
  instructionEn?: string;
}

async function issueInventoryToken(prisma: any, orderId: string, productId: string): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = await prisma.deliveryItem.findFirst({
      where: {
        productId,
        isArchived: false,
        isIssued: false,
        OR: [{ isReserved: false }, { reservedUntil: { lt: new Date() } }]
      },
      orderBy: { createdAt: "asc" }
    });

    if (!candidate) {
      throw badRequest("Товар временно закончился на складе");
    }

    const lock = await prisma.deliveryItem.updateMany({
      where: {
        id: candidate.id,
        isArchived: false,
        isIssued: false
      },
      data: {
        isIssued: true,
        isReserved: false,
        reservedUntil: null,
        issuedAt: new Date(),
        issuedOrderId: orderId
      }
    });

    if (lock.count === 1) {
      return candidate.secretValue;
    }
  }

  throw badRequest("Не удалось зарезервировать цифровой товар, повторите попытку");
}

export async function deliverOrder(prisma: PrismaClient, orderId: string): Promise<DeliveryResult> {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { product: true, delivery: true }
    });

    if (!order) {
      throw notFound("Заказ не найден");
    }

    if (order.delivery) {
      return {
        status: order.status,
        content: order.delivery.tokenOrContent ?? undefined,
        instructionRu: order.delivery.instructionRu ?? undefined,
        instructionEn: order.delivery.instructionEn ?? undefined
      };
    }

    if (!([OrderStatus.paid, OrderStatus.processing] as string[]).includes(order.status as string)) {
      throw badRequest("Выдача доступна только для оплаченного заказа");
    }

    if (order.product.deliveryType === DeliveryType.manual || order.product.requiresManualReview) {
      await tx.orderDelivery.create({
        data: {
          orderId: order.id,
          deliveryType: order.product.deliveryType,
          instructionRu: "Заказ передан на ручную обработку. Оператор свяжется с вами в ближайшее время.",
          instructionEn: "Order moved to manual processing. Operator will contact you soon.",
          deliveredBy: "manual_queue"
        }
      });

      await tx.order.update({
        where: { id: order.id },
        data: { status: OrderStatus.processing }
      });

      return {
        status: OrderStatus.processing,
        instructionRu: "Заказ в обработке",
        instructionEn: "Order is processing"
      };
    }

    let content = "";
    if (order.product.deliveryType === DeliveryType.instant_token) {
      content = `AUTO-${createIdempotencyKey("TOKEN")}`;
    } else {
      content = await issueInventoryToken(tx, order.id, order.productId);
    }

    await tx.orderDelivery.create({
      data: {
        orderId: order.id,
        deliveryType: order.product.deliveryType,
        tokenOrContent: content,
        instructionRu: "Токен выдан автоматически. Следуйте инструкции в FAQ для активации.",
        instructionEn: "Token has been issued automatically. Follow FAQ instructions to activate.",
        deliveredBy: "system"
      }
    });

    await tx.order.update({
      where: { id: order.id },
      data: {
        status: OrderStatus.issued,
        issuedAt: new Date()
      }
    });

    return {
      status: OrderStatus.issued,
      content,
      instructionRu: "Токен выдан",
      instructionEn: "Token issued"
    };
  });
}
