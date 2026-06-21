import type {
  IntegrationEventType,
  IntegrationMessage,
} from "@crash-game/contracts";
import type { SqsClient } from "./sqs-client";

export interface OutboxRecord {
  readonly id: string;
  readonly type: IntegrationEventType;
  readonly payload: unknown;
  readonly createdAt: Date;
}

export type PublishFn = (record: OutboxRecord) => Promise<void>;

/**
 * Port da outbox (implementada por cada serviço). `processPending` roda numa tx que seleciona as
 * pendentes com `FOR UPDATE SKIP LOCKED` (cada instância pega um lote disjunto), publica e marca
 * `sent`/incrementa `attempts` na mesma tx. `publish` dentro da tx garante at-least-once (falha de
 * commit pós-envio mantém a linha pendente; o consumidor deduplica por `messageId`).
 */
export interface OutboxStore {
  processPending(limit: number, publish: PublishFn): Promise<number>;
}

export interface OutboxRelayConfig {
  readonly queueUrl: string;
  readonly pollIntervalMs: number;
  readonly batchSize: number;
}

/** Poller que drena as linhas pendentes da outbox e as publica no SQS. */
export class OutboxRelay {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private draining = false;

  constructor(
    private readonly store: OutboxStore,
    private readonly client: SqsClient,
    private readonly config: OutboxRelayConfig,
    private readonly onError: (err: unknown) => void = () => {},
  ) {}

  start(): void {
    if (this.running) {
      return;
    }
    this.running = true;
    this.scheduleNext(0);
  }

  stop(): void {
    this.running = false;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  async drainOnce(): Promise<number> {
    return this.store.processPending(this.config.batchSize, (record) =>
      this.publish(record),
    );
  }

  private publish(record: OutboxRecord): Promise<void> {
    const envelope: IntegrationMessage = {
      messageId: record.id,
      type: record.type,
      occurredAt: record.createdAt.toISOString(),
      payload: record.payload as IntegrationMessage["payload"],
    };
    return this.client.send(this.config.queueUrl, JSON.stringify(envelope));
  }

  private scheduleNext(delayMs: number): void {
    if (!this.running) {
      return;
    }
    this.timer = setTimeout(() => {
      void this.tick();
    }, delayMs);
  }

  private async tick(): Promise<void> {
    if (this.draining) {
      return;
    }
    this.draining = true;
    let processed = 0;
    try {
      processed = await this.drainOnce();
    } catch (err) {
      this.onError(err);
    } finally {
      this.draining = false;
      const full = processed >= this.config.batchSize;
      this.scheduleNext(full ? 0 : this.config.pollIntervalMs);
    }
  }
}
