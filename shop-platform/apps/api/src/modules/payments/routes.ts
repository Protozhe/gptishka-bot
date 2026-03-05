import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createPaymentProvider } from "./provider.factory";
import { processPaymentWebhook } from "../../services/payment.service";
import { markOrderPaidAndDeliver } from "../../services/order.service";
import { notFound } from "../../lib/http-error";

const demoMarkPaidSchema = z.object({
  orderId: z.string().min(1)
});

export async function registerPaymentRoutes(app: FastifyInstance): Promise<void> {
  const provider = createPaymentProvider(app.ctx.env);

  app.post("/webhook", async (request) => {
    const signature = request.headers["x-signature"];
    return processPaymentWebhook({
      prisma: app.ctx.prisma,
      provider,
      body: request.body,
      signatureHeader: Array.isArray(signature) ? signature[0] : signature
    });
  });

  app.post("/demo/mark-paid", async (request) => {
    if (provider.name !== "demo") {
      throw notFound("Only available in demo provider mode");
    }

    const body = demoMarkPaidSchema.parse(request.body);
    const order = await app.ctx.prisma.order.findUnique({ where: { id: body.orderId } });
    if (!order) {
      throw notFound("Order not found");
    }

    await markOrderPaidAndDeliver(app.ctx.prisma, body.orderId);
    return { ok: true };
  });
}
