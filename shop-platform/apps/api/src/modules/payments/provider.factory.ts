import type { ApiEnv } from "@gptishka/config";
import type { PaymentProvider } from "./providers/types";
import { DemoPaymentProvider } from "./providers/demo.provider";
import { YooKassaPaymentProvider } from "./providers/yookassa.provider";

export function createPaymentProvider(env: ApiEnv): PaymentProvider {
  if (env.PAYMENT_PROVIDER === "yookassa") {
    if (!env.YOOKASSA_SHOP_ID || !env.YOOKASSA_SECRET_KEY) {
      throw new Error("YooKassa credentials are not configured");
    }
    return new YooKassaPaymentProvider(env.YOOKASSA_SHOP_ID, env.YOOKASSA_SECRET_KEY);
  }

  return new DemoPaymentProvider();
}
