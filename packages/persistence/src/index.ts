import { UnderscoreNamingStrategy } from "@mikro-orm/core";
import { defineConfig, type Options } from "@mikro-orm/postgresql";

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
    ...overrides,
  });
}
