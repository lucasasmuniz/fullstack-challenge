import { UnderscoreNamingStrategy } from "@mikro-orm/core";
import { defineConfig, type Options } from "@mikro-orm/postgresql";

export {
  createMikroOrmOutboxStore,
  type OutboxRowShape,
} from "./mikro-orm-outbox.store";

/** Preset base de MikroORM: consolida as opções comuns; cada serviço passa seus `overrides`. */
export function baseMikroOrmConfig(overrides: Options): Options {
  return defineConfig({
    namingStrategy: UnderscoreNamingStrategy,
    migrations: {
      path: "src/migrations",
      pathTs: "src/migrations",
      glob: "!(*.d).{ts,js}",
      emit: "ts",
      snapshot: false,
      disableForeignKeys: false,
    },
    forceUtcTimezone: true,
    debug: false,
    pool: { min: 2, max: 10 },
    driverOptions: {
      connection: {
        statement_timeout: 30000,
        idle_in_transaction_session_timeout: 60000,
      },
    },
    ...overrides,
  });
}
