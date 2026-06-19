import { baseMikroOrmConfig } from "@crash-game/persistence";
import type { Options } from "@mikro-orm/postgresql";

export function createOrmConfig(databaseUrl: string): Options {
  return baseMikroOrmConfig({
    clientUrl: databaseUrl,
    entities: [],
    discovery: { warnWhenNoEntities: false },
  });
}
