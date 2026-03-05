import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance } from "fastify";
import { PrismaClient } from "@prisma/client";
import type { ApiEnv } from "@gptishka/config";
import { ZodError } from "zod";
import { registerAuthRoutes } from "./modules/auth/routes";
import { registerAdminRoutes } from "./modules/admin/routes";
import { registerBotRoutes } from "./modules/bot/routes";
import { registerPaymentRoutes } from "./modules/payments/routes";
import { attachAuthGuards } from "./plugins/auth";
import { ensureTodayInventoryBackup } from "./services/inventory-backup.service";

export interface AppContext {
  env: ApiEnv;
  prisma: PrismaClient;
}

export async function createServer(env: ApiEnv): Promise<FastifyInstance> {
  const app = Fastify({ logger: { level: env.LOG_LEVEL } });
  const prisma = new PrismaClient();
  let backupInterval: NodeJS.Timeout | null = null;

  app.decorate("ctx", { env, prisma } as AppContext);

  app.addHook("onClose", async () => {
    if (backupInterval) {
      clearInterval(backupInterval);
    }
    await prisma.$disconnect();
  });

  await app.register(cors, {
    origin: true,
    credentials: true
  });

  await app.register(helmet, {
    contentSecurityPolicy: false
  });

  await app.register(cookie, {
    hook: "onRequest"
  });

  await app.register(jwt, {
    secret: env.JWT_ACCESS_SECRET
  });

  await app.register(rateLimit, {
    global: true,
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW_MS
  });

  attachAuthGuards(app);

  app.get("/health", async () => ({ ok: true }));

  await app.register(registerAuthRoutes, { prefix: "/v1/admin/auth" });
  await app.register(registerAdminRoutes, { prefix: "/v1/admin" });
  await app.register(registerBotRoutes, { prefix: "/v1/bot" });
  await app.register(registerPaymentRoutes, { prefix: "/v1/payments" });

  const runDailyBackup = async (origin: "startup" | "timer") => {
    try {
      await ensureTodayInventoryBackup(prisma);
      app.log.info({ origin }, "inventory daily backup checked");
    } catch (error) {
      app.log.error({ err: error, origin }, "inventory daily backup failed");
    }
  };

  await runDailyBackup("startup");
  backupInterval = setInterval(() => {
    void runDailyBackup("timer");
  }, 60 * 60 * 1000);

  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error }, "request failed");
    const statusCode = (error as { statusCode?: number }).statusCode ?? (error instanceof ZodError ? 400 : 500);
    const message =
      statusCode >= 500
        ? "Internal server error"
        : error instanceof ZodError
          ? "Validation error"
          : error.message;
    reply.status(statusCode).send({ error: message, message });
  });

  return app;
}
