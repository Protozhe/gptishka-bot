import { z } from "zod";

const baseSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error"]).default("info")
});

const apiSchema = baseSchema.extend({
  API_PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  DATABASE_URL: z.string().min(1),
  DIRECT_URL: z.string().optional(),
  ADMIN_SESSION_SECRET: z.string().min(32),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  BOT_TOKEN: z.string().min(10),
  WEBHOOK_BASE_URL: z.string().url().optional(),
  PAYMENT_PROVIDER: z.enum(["demo", "yookassa"]).default("demo"),
  YOOKASSA_SHOP_ID: z.string().optional(),
  YOOKASSA_SECRET_KEY: z.string().optional(),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000)
});

const botSchema = baseSchema.extend({
  BOT_TOKEN: z.string().min(10),
  API_BASE_URL: z.string().url(),
  DEFAULT_LOCALE: z.enum(["ru", "en"]).default("ru")
});

const adminSchema = baseSchema.extend({
  NEXT_PUBLIC_API_BASE_URL: z.string().url(),
  ADMIN_APP_PORT: z.coerce.number().int().positive().default(3000)
});

export type ApiEnv = z.infer<typeof apiSchema>;
export type BotEnv = z.infer<typeof botSchema>;
export type AdminEnv = z.infer<typeof adminSchema>;

export const loadApiEnv = (env: NodeJS.ProcessEnv): ApiEnv => apiSchema.parse(env);
export const loadBotEnv = (env: NodeJS.ProcessEnv): BotEnv => botSchema.parse(env);
export const loadAdminEnv = (env: NodeJS.ProcessEnv): AdminEnv => adminSchema.parse(env);
