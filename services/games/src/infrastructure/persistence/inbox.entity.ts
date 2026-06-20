import { Entity, PrimaryKey, Property } from "@mikro-orm/core";

/**
 * `inbox` — dedup de mensagens recebidas (idempotência exactly-once). O `message_id` é
 * inserido **na mesma transação** do efeito de domínio do handler; uma reentrega encontra
 * a linha e é ignorada (ack seco). Ver `InboxStore` (`@crash-game/messaging`).
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
