import { baseMikroOrmConfig } from "@crash-game/persistence";
import type { Options } from "@mikro-orm/postgresql";
import { Migrator } from "@mikro-orm/migrations";
import { RoundEntity } from "../persistence/round.entity";
import {
  SeedChainEntity,
  SeedChainSeedEntity,
} from "../persistence/seed-chain.entity";
import { BetEntity } from "../persistence/bet.entity";
import { OutboxEntity } from "../persistence/outbox.entity";
import { InboxEntity } from "../persistence/inbox.entity";
import { Migration20260619000100 } from "../../migrations/Migration20260619000100";
import { Migration20260619000200 } from "../../migrations/Migration20260619000200";
import { Migration20260620000100 } from "../../migrations/Migration20260620000100";
import { Migration20260620000200 } from "../../migrations/Migration20260620000200";

/**
 * Config MikroORM do Game Service: estado da rodada (`round`) + cold storage da cadeia de
 * seeds (`seed_chain`, `seed_chain_seed`).
 *
 * Migrations via **`migrationsList`** (classes explícitas, em ordem) — sob Bun a detecção
 * por path/glob não é confiável; lista explícita é determinística (mesmo motivo do Wallet).
 */
export function createOrmConfig(databaseUrl: string): Options {
  return baseMikroOrmConfig({
    clientUrl: databaseUrl,
    entities: [
      RoundEntity,
      SeedChainEntity,
      SeedChainSeedEntity,
      BetEntity,
      OutboxEntity,
      InboxEntity,
    ],
    extensions: [Migrator],
    migrations: {
      disableForeignKeys: false,
      migrationsList: [
        { name: "Migration20260619000100", class: Migration20260619000100 },
        { name: "Migration20260619000200", class: Migration20260619000200 },
        { name: "Migration20260620000100", class: Migration20260620000100 },
        { name: "Migration20260620000200", class: Migration20260620000200 },
      ],
    },
  });
}
