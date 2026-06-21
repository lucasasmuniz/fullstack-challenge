import { Module } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { MikroOrmModule } from "@mikro-orm/nestjs";
import { AllExceptionsFilter, AuthModule, ENV } from "@crash-game/nestjs-kit";
import { loadWalletsEnv } from "./infrastructure/config/env.schema";
import { createOrmConfig } from "./infrastructure/database/orm.config";
import { WalletsController } from "./presentation/controllers/wallets.controller";
import { AuthController } from "./presentation/controllers/auth.controller";
import { WalletController } from "./presentation/controllers/wallet.controller";
import { WALLET_REPOSITORY } from "./application/wallet.repository";
import { MikroOrmWalletRepository } from "./infrastructure/persistence/mikro-orm-wallet.repository";
import { CreateWalletHandler } from "./application/create-wallet.handler";
import { GetWalletHandler } from "./application/get-wallet.handler";
import { DepositHandler } from "./application/deposit.handler";
import { WithdrawHandler } from "./application/withdraw.handler";
import { WalletMovementService } from "./application/wallet-movement.service";
import { WalletSagaService } from "./application/wallet-saga.service";
import { WalletMetrics } from "./infrastructure/observability/wallet-metrics";
import { MikroOrmOutboxStore } from "./infrastructure/messaging/mikro-orm-outbox.store";
import { sqsClientProvider } from "./infrastructure/messaging/sqs.providers";
import { OutboxRelayService } from "./infrastructure/messaging/outbox-relay.service";
import { WalletInboxConsumer } from "./infrastructure/messaging/wallet-inbox.consumer";
import { REALTIME_PUBLISHER } from "./application/realtime.port";
import { WalletGateway } from "./infrastructure/websocket/wallet.gateway";

const env = loadWalletsEnv();

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
  controllers: [WalletsController, AuthController, WalletController],
  providers: [
    { provide: ENV, useValue: env },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: WALLET_REPOSITORY, useClass: MikroOrmWalletRepository },
    WalletMetrics,
    WalletMovementService,
    CreateWalletHandler,
    GetWalletHandler,
    DepositHandler,
    WithdrawHandler,
    WalletSagaService,
    sqsClientProvider,
    MikroOrmOutboxStore,
    OutboxRelayService,
    WalletInboxConsumer,
    WalletGateway,
    { provide: REALTIME_PUBLISHER, useExisting: WalletGateway },
  ],
  exports: [ENV],
})
export class AppModule {}
