import { Entity, Index, PrimaryKey, Property } from "@mikro-orm/core";

/**
 * `outbox` — transactional outbox. A linha é gravada **na mesma transação** do estado de
 * domínio que a originou (ex.: a aposta + `DebitFunds`); o relay (`OutboxRelay`) publica no
 * SQS depois do commit e marca `sent`. `id` é o `messageId` do envelope (estável entre
 * retries → o consumidor deduplica por ele). `next_attempt_at` dá o backoff no erro.
 */
@Entity({ tableName: "outbox" })
@Index({ properties: ["status", "nextAttemptAt"] })
export class OutboxEntity {
  @PrimaryKey({ type: "uuid" })
  id!: string;

  @Property({ type: "string" })
  type!: string;

  @Property({ type: "json" })
  payload!: unknown;

  /** `pending` → a publicar; `sent` → já no SQS; `failed` → poison-pill (excedeu retries). */
  @Property({ type: "string", default: "pending" })
  status: string = "pending";

  @Property({ type: "integer", default: 0 })
  attempts: number = 0;

  @Property({ type: "datetime" })
  nextAttemptAt: Date = new Date();

  @Property({ type: "datetime" })
  createdAt: Date = new Date();

  @Property({ type: "datetime", nullable: true })
  sentAt!: Date | null;
}
