import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { MikroORM } from "@mikro-orm/core";
import { ENV } from "@crash-game/nestjs-kit";
import { AppModule } from "./app.module";
import type { GamesEnv } from "./infrastructure/config/env.schema";
import { ValkeyIoAdapter } from "@crash-game/realtime";
import { startMetrics } from "@crash-game/observability";
import { setupSwagger } from "./infrastructure/swagger";
import { loadGamesEnv } from "./infrastructure/config/env.schema";

async function bootstrap(): Promise<void> {
  const bootEnv = loadGamesEnv();
  if (bootEnv.OTEL_ENABLED) {
    startMetrics("crash-game-games", bootEnv.METRICS_PORT);
    new Logger("Bootstrap").log(
      `Metrics on :${bootEnv.METRICS_PORT.toString()}/metrics`,
    );
  }

  const app = await NestFactory.create(AppModule);
  const env = app.get<GamesEnv>(ENV);

  await app.get(MikroORM).migrator.up();

  setupSwagger(app);

  const wsAdapter = new ValkeyIoAdapter(app, env.VALKEY_URL);
  await wsAdapter.connect();
  app.useWebSocketAdapter(wsAdapter);

  app.enableShutdownHooks();

  await app.listen(env.PORT, "0.0.0.0");
  new Logger("Bootstrap").log(`Games service running on port ${env.PORT}`);
}

bootstrap().catch((error: unknown) => {
  new Logger("Bootstrap").error("Failed to bootstrap Games service", error);
  process.exit(1);
});
