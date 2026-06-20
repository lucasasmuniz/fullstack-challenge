import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from "@nestjs/common";
import { createInboxConsumer, type SqsConsumer, type SqsClient } from "@crash-game/messaging";
import { ENV } from "@crash-game/nestjs-kit";
import type { WalletsEnv } from "../config/env.schema";
import { WalletSagaService } from "../../application/wallet-saga.service";
import { SQS_CLIENT } from "./sqs.providers";

/**
 * Consumidor do `wallet-inbox` (comandos do Game). Sobe um `SqsConsumer` long-poll no
 * bootstrap (se `MESSAGING_ENABLED`) via `createInboxConsumer` (callback de erro/PII padronizado).
 */
@Injectable()
export class WalletInboxConsumer implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(WalletInboxConsumer.name);
  private consumer: SqsConsumer | null = null;

  constructor(
    @Inject(SQS_CLIENT) private readonly sqs: SqsClient,
    private readonly saga: WalletSagaService,
    @Inject(ENV) private readonly env: WalletsEnv,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.env.MESSAGING_ENABLED) {
      this.logger.log("MESSAGING_ENABLED=false — consumidor do wallet-inbox desligado.");
      return;
    }
    this.consumer = createInboxConsumer(this.sqs, {
      queueLabel: "wallet-inbox",
      queueUrl: this.env.SQS_INBOX_QUEUE_URL,
      receive: {
        waitTimeSeconds: this.env.SQS_WAIT_TIME_SECONDS,
        maxMessages: this.env.SQS_MAX_MESSAGES,
        visibilityTimeoutSeconds: this.env.SQS_VISIBILITY_TIMEOUT_SECONDS,
      },
      handlers: {
        DebitFunds: (m) => this.saga.onDebitFunds(m),
        CreditFunds: (m) => this.saga.onCreditFunds(m),
      },
      logger: this.logger,
    });
    this.consumer.start();
    this.logger.log("Consumidor do wallet-inbox iniciado.");
  }

  async onModuleDestroy(): Promise<void> {
    await this.consumer?.stop();
  }
}
