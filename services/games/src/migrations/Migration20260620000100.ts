import { Migration } from "@mikro-orm/migrations";

/**
 * Saga Game↔Wallet no DB `games`:
 * - `bet` — aposta state-stored. `UNIQUE(round_id, player_id)` impõe "1 aposta/jogador/
 *   rodada"; `CHECK(amount_cents > 0)`; `version` p/ concorrência otimista.
 * - `outbox` — transactional outbox (publicada pelo relay; `id` = `messageId`).
 * - `inbox` — dedup de mensagens recebidas (idempotência exactly-once).
 */
export class Migration20260620000100 extends Migration {
  override up(): void {
    this.addSql(`
      create table "bet" (
        "id" uuid not null,
        "round_id" uuid not null,
        "player_id" uuid not null,
        "amount_cents" bigint not null,
        "status" varchar(255) not null,
        "auto_cashout_target_x100" int null,
        "cashout_multiplier_x100" int null,
        "payout_cents" bigint null,
        "version" int not null,
        "placed_at" timestamptz not null,
        "confirmed_at" timestamptz null,
        "resolved_at" timestamptz null,
        "created_at" timestamptz not null,
        constraint "bet_pkey" primary key ("id"),
        constraint "bet_amount_cents_check" check ("amount_cents" > 0)
      );
    `);
    this.addSql(
      `alter table "bet" add constraint "bet_round_id_player_id_unique" unique ("round_id", "player_id");`,
    );
    this.addSql(`create index "bet_round_id_index" on "bet" ("round_id");`);
    this.addSql(`create index "bet_player_id_index" on "bet" ("player_id");`);

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
    this.addSql(`drop table if exists "bet";`);
  }
}
