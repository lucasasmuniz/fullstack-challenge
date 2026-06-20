import type {
  IntegrationEventType,
  IntegrationMessage,
} from "@crash-game/contracts";
import type { SqsClient } from "./sqs-client";

/** Uma linha pendente da tabela outbox (a forma mínima que o relay precisa). */
export interface OutboxRecord {
  readonly id: string;
  readonly type: IntegrationEventType;
  readonly payload: unknown;
  readonly createdAt: Date;
}

/** Publica uma linha da outbox; lança em falha técnica (mantém a linha pendente p/ retry). */
export type PublishFn = (record: OutboxRecord) => Promise<void>;

/**
 * Port da outbox (implementada por cada serviço com MikroORM). `processPending` é
 * **transacional e distribuído**: abre uma tx, seleciona linhas pendentes com
 * `FOR UPDATE SKIP LOCKED` (cada instância pega um lote disjunto, sem contenção),
 * chama `publish` por linha e marca `sent` no sucesso / incrementa `attempts` + backoff
 * na falha — tudo na mesma tx. Retorna quantas processou (0 = nada pendente).
 *
 * Manter o `publish` **dentro** da tx garante que, se o commit falhar após o envio, a
 * linha continua pendente e será republicada (at-least-once); o consumidor deduplica por
 * `messageId`. Nunca há mensagem publicada sem a linha marcada de forma inconsistente.
 */
export interface OutboxStore {
  processPending(limit: number, publish: PublishFn): Promise<number>;
}

export interface OutboxRelayConfig {
  /** Fila destino (Game→`wallet-inbox`, Wallet→`game-inbox`). */
  readonly queueUrl: string;
  /** Intervalo do poller. */
  readonly pollIntervalMs: number;
  /** Linhas por ciclo. */
  readonly batchSize: number;
}

/**
 * Relay da outbox: poller que drena as linhas pendentes e as publica no SQS. A montagem
 * do envelope ({@link IntegrationMessage}) vive aqui; a transação/SKIP LOCKED vive no
 * `OutboxStore` do serviço. Roda em **todas as instâncias** — o SKIP LOCKED shardeia o
 * trabalho automaticamente.
 */
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

  /** Um ciclo de drenagem (exposto para testes determinísticos). */
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
      // Se drenou um lote cheio, provavelmente há mais — volta logo; senão, espera o intervalo.
      const full = processed >= this.config.batchSize;
      this.scheduleNext(full ? 0 : this.config.pollIntervalMs);
    }
  }
}
