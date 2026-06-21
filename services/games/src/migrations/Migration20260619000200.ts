import { Migration } from "@mikro-orm/migrations";

/**
 * `round` — estado persistido da rodada (CQRS state-stored). `version` para concorrência
 * otimista (fencing do scheduler). Índices: `round_number` único (sequência) e `status`
 * (busca da rodada corrente / histórico).
 */
export class Migration20260619000200 extends Migration {
  override up(): void {
    this.addSql(`
      create table "round" (
        "id" uuid not null,
        "round_number" int not null,
        "status" varchar(255) not null,
        "crash_point_x100" int not null,
        "server_seed_hash" text not null,
        "server_seed" text not null,
        "public_seed" text not null,
        "chain_id" uuid not null,
        "chain_index" int not null,
        "version" int not null,
        "betting_ends_at" timestamptz not null,
        "started_at" timestamptz null,
        "crashed_at" timestamptz null,
        "settled_at" timestamptz null,
        "created_at" timestamptz not null,
        constraint "round_pkey" primary key ("id")
      );
    `);
    this.addSql(
      `alter table "round" add constraint "round_round_number_unique" unique ("round_number");`,
    );
    this.addSql(`create index "round_status_index" on "round" ("status");`);
    this.addSql(`create sequence "round_number_seq" as bigint start with 1;`);
  }

  override down(): void {
    this.addSql(`drop sequence if exists "round_number_seq";`);
    this.addSql(`drop table if exists "round";`);
  }
}
