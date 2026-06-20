import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from "@nestjs/common";
import { createOutboxRelay, type OutboxRelay, type SqsClient } from "@crash-game/messaging";
import { ENV } from "@crash-game/nestjs-kit";
import type { WalletsEnv } from "../config/env.schema";
import { MikroOrmOutboxStore } from "./mikro-orm-outbox.store";
import { SQS_CLIENT } from "./sqs.providers";

/**
 * Relay da outbox da Wallet → fila `game-inbox` (`SQS_OUTBOUND_QUEUE_URL`). Publica os
 * resultados (`FundsDebited`/`FundsDebitRejected`/`FundsCredited`). Sobe no bootstrap se
 * `MESSAGING_ENABLED`.
 */
@Injectable()
export class OutboxRelayService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(OutboxRelayService.name);
  private relay: OutboxRelay | null = null;

  constructor(
    private readonly store: MikroOrmOutboxStore,
    @Inject(SQS_CLIENT) private readonly sqs: SqsClient,
    @Inject(ENV) private readonly env: WalletsEnv,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.env.MESSAGING_ENABLED) {
      this.logger.log("MESSAGING_ENABLED=false — relay da outbox desligado.");
      return;
    }
    this.relay = createOutboxRelay({
      store: this.store,
      client: this.sqs,
      config: {
        queueUrl: this.env.SQS_OUTBOUND_QUEUE_URL,
        pollIntervalMs: this.env.OUTBOX_RELAY_INTERVAL_MS,
        batchSize: this.env.OUTBOX_RELAY_BATCH_SIZE,
      },
      logger: this.logger,
      destinationLabel: "game-inbox",
    });
    this.relay.start();
    this.logger.log("Relay da outbox iniciado (→ game-inbox).");
  }

  onModuleDestroy(): void {
    this.relay?.stop();
  }
}
