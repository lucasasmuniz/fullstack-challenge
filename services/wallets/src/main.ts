import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { MikroORM } from "@mikro-orm/core";
import { ENV } from "@crash-game/nestjs-kit";
import { ValkeyIoAdapter } from "@crash-game/realtime";
import { AppModule } from "./app.module";
import type { WalletsEnv } from "./infrastructure/config/env.schema";
import { setupSwagger } from "./infrastructure/swagger";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const env = app.get<WalletsEnv>(ENV);

  await app.get(MikroORM).migrator.up();

  setupSwagger(app); // OpenAPI em /docs

  // Adapter Valkey do socket.io (fanout do push de saldo entre instâncias).
  const wsAdapter = new ValkeyIoAdapter(app, env.VALKEY_URL);
  await wsAdapter.connect();
  app.useWebSocketAdapter(wsAdapter);
  app.enableShutdownHooks();

  await app.listen(env.PORT, "0.0.0.0");
  new Logger("Bootstrap").log(`Wallets service running on port ${env.PORT}`);
}

bootstrap().catch((error: unknown) => {
  new Logger("Bootstrap").error("Failed to bootstrap Wallets service", error);
  process.exit(1);
});
