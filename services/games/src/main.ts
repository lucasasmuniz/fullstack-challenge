import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { MikroORM } from "@mikro-orm/core";
import { ENV } from "@crash-game/nestjs-kit";
import { AppModule } from "./app.module";
import type { GamesEnv } from "./infrastructure/config/env.schema";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const env = app.get<GamesEnv>(ENV);

  await app.get(MikroORM).migrator.up();

  // Necessário para OnModuleDestroy (RoundScheduler solta o lease + quit do Valkey no SIGTERM).
  app.enableShutdownHooks();

  await app.listen(env.PORT, "0.0.0.0");
  new Logger("Bootstrap").log(`Games service running on port ${env.PORT}`);
}

bootstrap().catch((error: unknown) => {
  new Logger("Bootstrap").error("Failed to bootstrap Games service", error);
  process.exit(1);
});
