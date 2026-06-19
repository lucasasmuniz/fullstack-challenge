import { baseMikroOrmConfig } from "@crash-game/persistence";
import type { Options } from "@mikro-orm/postgresql";
import { Migrator } from "@mikro-orm/migrations";
import { WalletEntity } from "../persistence/wallet.entity";
import { WalletEventEntity } from "../persistence/wallet-event.entity";
import { Migration20260619000100 } from "../../migrations/Migration20260619000100";
import { Migration20260619000200 } from "../../migrations/Migration20260619000200";

/**
 * Config MikroORM do Wallet Service. Registra o event store (`wallet_event`) e a
 * projeção de saldo (`wallet`).
 *
 * As migrations são passadas via **`migrationsList`** (classes explícitas, em ordem)
 * em vez de descoberta por path/glob: o Bun roda `.ts` direto, sem `dist/`, e a
 * detecção de migrations TS do MikroORM por filesystem não é confiável nesse cenário.
 * Lista explícita = determinístico e à prova de Bun.
 */
export function createOrmConfig(databaseUrl: string): Options {
  return baseMikroOrmConfig({
    clientUrl: databaseUrl,
    entities: [WalletEntity, WalletEventEntity],
    // No MikroORM v6 a extensão Migrator não é auto-registrada só por estar
    // instalada — precisa entrar em `extensions` para o `orm.migrator` existir.
    extensions: [Migrator],
    migrations: {
      disableForeignKeys: false,
      migrationsList: [
        {
          name: "Migration20260619000100",
          class: Migration20260619000100,
        },
        {
          name: "Migration20260619000200",
          class: Migration20260619000200,
        },
      ],
    },
  });
}
