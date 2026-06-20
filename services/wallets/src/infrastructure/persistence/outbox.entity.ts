import { Entity, Index, PrimaryKey, Property } from "@mikro-orm/core";

/**
 * `outbox` — transactional outbox. A linha é gravada **na mesma transação** do append do
 * evento no ledger (ex.: `FundsDebited`); o relay publica no SQS depois do commit e marca
 * `sent`. `id` é o `messageId` do envelope (dedup no consumidor). `next_attempt_at` = backoff.
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
