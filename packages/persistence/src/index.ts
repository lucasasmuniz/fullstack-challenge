import { UnderscoreNamingStrategy } from "@mikro-orm/core";
import { defineConfig, type Options } from "@mikro-orm/postgresql";

export {
  createMikroOrmOutboxStore,
  type OutboxRowShape,
} from "./mikro-orm-outbox.store";

/**
 * Preset base de MikroORM compartilhado pelos serviços (Etapa 0: só deps + preset).
 * NÃO conecta nada e NÃO declara entidades — apenas consolida opções comuns.
 * A fiação real (clientUrl, entities, migrations, NestJS) acontece na Etapa 1;
 * cada serviço chama este factory passando os seus `overrides`.
 */
export function baseMikroOrmConfig(overrides: Options): Options {
  return defineConfig({
    namingStrategy: UnderscoreNamingStrategy,
    // Bun roda .ts direto (sem build pra dist). Apontamos as migrations pro
    // diretório TS em ambos os modos (path/pathTs) + glob .ts/.js, para o migrator
    // achá-las independentemente da detecção de TS do MikroORM sob Bun. Sem snapshot
    // (não há fluxo de diff schema em runtime).
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
    // Pool explícito + timeouts no nível do Postgres (defesa em profundidade junto com o
    // timeout do SQS). `statement_timeout` mata uma query travada (deadlock/lock longo) antes
    // que ela congele o consumer loop; `idle_in_transaction_session_timeout` aborta uma tx
    // ociosa — limita o caso do relay segurar a tx enquanto publica no SQS (é > o
    // `requestTimeout` do SQS, ~30s, para não abortar um relay saudável).
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
