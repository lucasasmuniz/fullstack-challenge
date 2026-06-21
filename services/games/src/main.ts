import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { MikroORM } from "@mikro-orm/core";
import { ENV } from "@crash-game/nestjs-kit";
import { AppModule } from "./app.module";
import type { GamesEnv } from "./infrastructure/config/env.schema";
import { ValkeyIoAdapter } from "@crash-game/realtime";
import { setupSwagger } from "./infrastructure/swagger";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const env = app.get<GamesEnv>(ENV);

  await app.get(MikroORM).migrator.up();

  setupSwagger(app); // OpenAPI em /docs



  // Adapter Valkey do socket.io (fanout entre instâncias). Conecta antes de o gateway subir.
  const wsAdapter = new ValkeyIoAdapter(app, env.VALKEY_URL);
  await wsAdapter.connect();
  app.useWebSocketAdapter(wsAdapter);

  // Necessário para OnModuleDestroy (RoundScheduler solta o lease + quit do Valkey no SIGTERM).
  app.enableShutdownHooks();

  await app.listen(env.PORT, "0.0.0.0");
  new Logger("Bootstrap").log(`Games service running on port ${env.PORT}`);
}

bootstrap().catch((error: unknown) => {
  new Logger("Bootstrap").error("Failed to bootstrap Games service", error);
  process.exit(1);
});
