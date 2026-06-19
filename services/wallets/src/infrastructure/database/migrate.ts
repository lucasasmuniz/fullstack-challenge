import { MikroORM } from "@mikro-orm/postgresql";
import { createOrmConfig } from "./orm.config";

/**
 * Runner de migrations standalone (debug/CI). No fluxo normal as migrations rodam
 * sozinhas no boot do serviço (`migrator.up()` no `main.ts`, zero-manual — R1); este
 * script existe para aplicá-las/revertê-las à mão sem subir o NestJS.
 *
 *   bun run db:migrate           # aplica pendentes (up)
 *   bun run db:migrate -- down   # reverte a última (down)
 */
const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://admin:admin@localhost:5432/wallets";

async function run(): Promise<void> {
  const direction = process.argv[2] === "down" ? "down" : "up";
  const orm = await MikroORM.init(createOrmConfig(DATABASE_URL));
  try {
    const executed =
      direction === "down"
        ? await orm.migrator.down()
        : await orm.migrator.up();
    const names = executed.map((m) => m.name);
    console.log(
      `[migrate] ${direction}: ${names.length} migration(s)`,
      names,
    );
  } finally {
    await orm.close(true);
  }
}

run().catch((error: unknown) => {
  console.error("[migrate] failed", error);
  process.exit(1);
});
