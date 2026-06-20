import { Entity, PrimaryKey, Property } from "@mikro-orm/core";

/**
 * `inbox` — dedup de mensagens recebidas do `wallet-inbox` (idempotência exactly-once). O
 * `message_id` é inserido **na mesma transação** do efeito de domínio (append do evento +
 * outbox da resposta); uma reentrega encontra a linha e é ignorada (ack seco).
 */
@Entity({ tableName: "inbox" })
export class InboxEntity {
  @PrimaryKey({ type: "uuid" })
  messageId!: string;

  @Property({ type: "string" })
  type!: string;

  @Property({ type: "datetime" })
  processedAt: Date = new Date();
}
