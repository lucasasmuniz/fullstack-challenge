import { Migration } from "@mikro-orm/migrations";

/**
 * Saga Game↔Wallet (Etapa 5a) no DB `wallets`:
 * - `outbox` — transactional outbox (resultados `FundsDebited`/`FundsDebitRejected`/
 *   `FundsCredited`; `id` = `messageId`).
 * - `inbox` — dedup de mensagens recebidas (`DebitFunds`/`CreditFunds`).
 */
export class Migration20260620000100 extends Migration {
  override up(): void {
    this.addSql(`
      create table "outbox" (
        "id" uuid not null,
        "type" varchar(255) not null,
        "payload" jsonb not null,
        "status" varchar(255) not null default 'pending',
        "attempts" int not null default 0,
        "next_attempt_at" timestamptz not null,
        "created_at" timestamptz not null,
        "sent_at" timestamptz null,
        constraint "outbox_pkey" primary key ("id")
      );
    `);
    this.addSql(
      `create index "outbox_status_next_attempt_at_index" on "outbox" ("status", "next_attempt_at");`,
    );

    this.addSql(`
      create table "inbox" (
        "message_id" uuid not null,
        "type" varchar(255) not null,
        "processed_at" timestamptz not null,
        constraint "inbox_pkey" primary key ("message_id")
      );
    `);
  }

  override down(): void {
    this.addSql(`drop table if exists "inbox";`);
    this.addSql(`drop table if exists "outbox";`);
  }
}
