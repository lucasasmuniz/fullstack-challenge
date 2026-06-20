import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from "@nestjs/common";
import { createInboxConsumer, type SqsConsumer, type SqsClient } from "@crash-game/messaging";
import { ENV } from "@crash-game/nestjs-kit";
import type { GamesEnv } from "../config/env.schema";
import { BetSagaService } from "../../application/bet-saga.service";
import { SQS_CLIENT } from "./sqs.providers";

/**
 * Consumidor do `game-inbox` (respostas da Wallet). Sobe um `SqsConsumer` long-poll no
 * bootstrap (se `MESSAGING_ENABLED`) via `createInboxConsumer` (callback de erro/PII
 * padronizado). Erro de handler → sem ack → retry/DLQ. Idempotência: inbox + máquina de estados.
 */
@Injectable()
export class GameInboxConsumer implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(GameInboxConsumer.name);
  private consumer: SqsConsumer | null = null;

  constructor(
    @Inject(SQS_CLIENT) private readonly sqs: SqsClient,
    private readonly saga: BetSagaService,
    @Inject(ENV) private readonly env: GamesEnv,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.env.MESSAGING_ENABLED) {
      this.logger.log("MESSAGING_ENABLED=false — consumidor do game-inbox desligado.");
      return;
    }
    this.consumer = createInboxConsumer(this.sqs, {
      queueLabel: "game-inbox",
      queueUrl: this.env.SQS_INBOX_QUEUE_URL,
      receive: {
        waitTimeSeconds: this.env.SQS_WAIT_TIME_SECONDS,
        maxMessages: this.env.SQS_MAX_MESSAGES,
        visibilityTimeoutSeconds: this.env.SQS_VISIBILITY_TIMEOUT_SECONDS,
      },
      handlers: {
        FundsDebited: (m) => this.saga.onFundsDebited(m),
        FundsDebitRejected: (m) => this.saga.onFundsDebitRejected(m),
        FundsCredited: (m) => this.saga.onFundsCredited(m),
      },
      logger: this.logger,
    });
    this.consumer.start();
    this.logger.log("Consumidor do game-inbox iniciado.");
  }

  async onModuleDestroy(): Promise<void> {
    await this.consumer?.stop();
  }
}
