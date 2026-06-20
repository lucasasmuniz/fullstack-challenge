import { Module } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { MikroOrmModule } from "@mikro-orm/nestjs";
import { AllExceptionsFilter, AuthModule, ENV } from "@crash-game/nestjs-kit";
import { loadGamesEnv } from "./infrastructure/config/env.schema";
import { createOrmConfig } from "./infrastructure/database/orm.config";
import { GamesController } from "./presentation/controllers/games.controller";
import { AuthController } from "./presentation/controllers/auth.controller";
import { RoundsController } from "./presentation/controllers/rounds.controller";
import { ProvablyFairDomainService } from "./domain";
import { ROUND_REPOSITORY } from "./application/round.repository";
import { ROUND_OPENER } from "./application/round-opener";
import { SEED_CHAIN_REPOSITORY } from "./application/seed-chain.repository";
import { CHAIN_GENERATOR } from "./application/chain-generator.port";
import { PUBLIC_SEED_BEACON } from "./application/public-seed-beacon.port";
import { VALKEY } from "./application/valkey.port";
import { MikroOrmRoundRepository } from "./infrastructure/persistence/mikro-orm-round.repository";
import { MikroOrmRoundOpener } from "./infrastructure/persistence/mikro-orm-round-opener";
import { MikroOrmSeedChainRepository } from "./infrastructure/persistence/mikro-orm-seed-chain.repository";
import { IoredisValkeyClient } from "./infrastructure/valkey/ioredis-valkey.client";
import { WorkerChainGenerator } from "./infrastructure/seed/worker-chain-generator";
import { DrandPublicSeedBeacon } from "./infrastructure/seed/drand-public-seed-beacon";
import { SeedChainService } from "./application/seed-chain.service";
import { SeedBuffer } from "./application/seed-buffer";
import { LeaderLease } from "./application/leader-lease";
import { RoundScheduler } from "./application/round-scheduler";
import { RoundQueryService } from "./application/round-query.service";

// Carregado no import do módulo => fail-fast no bootstrap se faltar/for inválida uma env.
const env = loadGamesEnv();

@Module({
  imports: [
    MikroOrmModule.forRoot(createOrmConfig(env.DATABASE_URL)),
    AuthModule.forRoot({
      issuer: env.KEYCLOAK_ISSUER,
      jwksUri: env.KEYCLOAK_JWKS_URI,
      authorizedParty: env.KEYCLOAK_CLIENT_ID,
      expectedTokenType: "Bearer",
    }),
  ],
  controllers: [GamesController, AuthController, RoundsController],
  providers: [
    { provide: ENV, useValue: env },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    // Domain service (puro, sem framework) registrado como provider.
    ProvablyFairDomainService,
    // Ports → adapters (hexagonal).
    { provide: ROUND_REPOSITORY, useClass: MikroOrmRoundRepository },
    { provide: ROUND_OPENER, useClass: MikroOrmRoundOpener },
    { provide: SEED_CHAIN_REPOSITORY, useClass: MikroOrmSeedChainRepository },
    { provide: CHAIN_GENERATOR, useClass: WorkerChainGenerator },
    { provide: PUBLIC_SEED_BEACON, useClass: DrandPublicSeedBeacon },
    { provide: VALKEY, useClass: IoredisValkeyClient },
    // Application services.
    SeedChainService,
    SeedBuffer,
    LeaderLease,
    RoundQueryService,
    // Engine autoritativo (inicia no OnApplicationBootstrap).
    RoundScheduler,
  ],
  exports: [ENV],
})
export class AppModule {}
