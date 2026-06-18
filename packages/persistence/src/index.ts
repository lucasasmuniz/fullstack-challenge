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
    migrations: { path: "dist/migrations", pathTs: "src/migrations" },
    forceUtcTimezone: true,
    debug: false,
    ...overrides,
  });
}
