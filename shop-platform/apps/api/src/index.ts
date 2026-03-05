import { loadApiEnv } from "@gptishka/config";
import { createServer } from "./server";

async function bootstrap() {
  const env = loadApiEnv(process.env);
  const app = await createServer(env);

  await app.listen({
    port: env.API_PORT,
    host: "0.0.0.0"
  });

  app.log.info({ port: env.API_PORT }, "API started");
}

bootstrap().catch((error) => {
  console.error(error);
  process.exit(1);
});
