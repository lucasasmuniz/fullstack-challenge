import { Migration } from "@mikro-orm/migrations";

/**
 * Schema do Wallet Service: event store (`wallet_event`, append-only) + projeção de
 * saldo (`wallet`). Dinheiro em `bigint` (centavos). Invariantes no banco:
 * `UNIQUE(wallet_id, version)` (concorrência otimista), `UNIQUE(reason,
 * correlation_id)` (idempotência) e `CHECK (balance_cents >= 0)` (saldo não-negativo).
 */
export class Migration20260619000100 extends Migration {
  override up(): void {
    this.addSql(`
      create table "wallet_event" (
        "id" uuid not null,
        "wallet_id" uuid not null,
        "version" int not null,
        "type" varchar(255) not null,
        "amount_cents" bigint not null,
        "reason" varchar(255) null,
        "correlation_id" varchar(255) null,
        "metadata" jsonb null,
        "occurred_at" timestamptz not null,
        constraint "wallet_event_pkey" primary key ("id")
      );
    `);
    this.addSql(
      `create index "wallet_event_wallet_id_index" on "wallet_event" ("wallet_id");`,
    );
    this.addSql(
      `alter table "wallet_event" add constraint "wallet_event_wallet_id_version_unique" unique ("wallet_id", "version");`,
    );
    this.addSql(
      `alter table "wallet_event" add constraint "wallet_event_wallet_id_reason_correlation_id_unique" unique ("wallet_id", "reason", "correlation_id");`,
    );

    this.addSql(`
      create table "wallet" (
        "id" uuid not null,
        "player_id" uuid not null,
        "balance_cents" bigint not null,
        "version" int not null,
        "currency" varchar(3) not null,
        "created_at" timestamptz not null,
        "updated_at" timestamptz not null,
        constraint "wallet_pkey" primary key ("id")
      );
    `);
    this.addSql(
      `alter table "wallet" add constraint "wallet_player_id_unique" unique ("player_id");`,
    );
    this.addSql(
      `alter table "wallet" add constraint "wallet_balance_cents_check" check ("balance_cents" >= 0);`,
    );
  }

  override down(): void {
    this.addSql(`drop table if exists "wallet_event";`);
    this.addSql(`drop table if exists "wallet";`);
  }
}
