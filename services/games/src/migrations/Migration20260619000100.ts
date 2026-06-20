import { Migration } from "@mikro-orm/migrations";

/**
 * Cold storage do provably fair (ADR 0013): `seed_chain` (metadados, 1 ativa por vez) +
 * `seed_chain_seed` (sementes, **PK composta `(chain_id, index)`** para coexistência de
 * cadeias na rotação). Consumo O(1) por `(chain_id, index)`.
 */
export class Migration20260619000100 extends Migration {
  override up(): void {
    this.addSql(`
      create table "seed_chain" (
        "id" uuid not null,
        "root_commitment" text not null,
        "length" int not null,
        "cursor" int not null,
        "public_seed" text null,
        "beacon_round" bigint null,
        "active" boolean not null,
        "created_at" timestamptz not null,
        constraint "seed_chain_pkey" primary key ("id")
      );
    `);
    // No máximo uma cadeia ativa por vez.
    this.addSql(
      `create unique index "seed_chain_active_unique" on "seed_chain" ("active") where "active" = true;`,
    );

    this.addSql(`
      create table "seed_chain_seed" (
        "chain_id" uuid not null,
        "index" int not null,
        "server_seed" text not null,
        "server_seed_hash" text not null,
        "consumed_at" timestamptz null,
        constraint "seed_chain_seed_pkey" primary key ("chain_id", "index")
      );
    `);
  }

  override down(): void {
    this.addSql(`drop table if exists "seed_chain_seed";`);
    this.addSql(`drop table if exists "seed_chain";`);
  }
}
