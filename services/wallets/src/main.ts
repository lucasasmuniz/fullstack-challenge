import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { MikroORM } from "@mikro-orm/core";
import { ENV } from "@crash-game/nestjs-kit";
import { AppModule } from "./app.module";
import type { WalletsEnv } from "./infrastructure/config/env.schema";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const env = app.get<WalletsEnv>(ENV);

  await app.get(MikroORM).migrator.up();

  await app.listen(env.PORT, "0.0.0.0");
  new Logger("Bootstrap").log(`Wallets service running on port ${env.PORT}`);
}

bootstrap().catch((error: unknown) => {
  new Logger("Bootstrap").error("Failed to bootstrap Wallets service", error);
  process.exit(1);
});
