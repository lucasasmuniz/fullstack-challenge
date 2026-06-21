import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { MikroORM } from "@mikro-orm/core";
import { ENV } from "@crash-game/nestjs-kit";
import { ValkeyIoAdapter } from "@crash-game/realtime";
import { startMetrics } from "@crash-game/observability";
import { AppModule } from "./app.module";
import {
  loadWalletsEnv,
  type WalletsEnv,
} from "./infrastructure/config/env.schema";
import { setupSwagger } from "./infrastructure/swagger";

async function bootstrap(): Promise<void> {
  const bootEnv = loadWalletsEnv();
  if (bootEnv.OTEL_ENABLED) {
    startMetrics("crash-game-wallets", bootEnv.METRICS_PORT);
    new Logger("Bootstrap").log(
      `Metrics on :${bootEnv.METRICS_PORT.toString()}/metrics`,
    );
  }

  const app = await NestFactory.create(AppModule);
  const env = app.get<WalletsEnv>(ENV);

  await app.get(MikroORM).migrator.up();

  setupSwagger(app);

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
