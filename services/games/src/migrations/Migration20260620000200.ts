import { Migration } from "@mikro-orm/migrations";

/**
 * WebSocket: adiciona `bet.username` — capturado do JWT no `POST /bet` e emitido nos
 * eventos WS para a lista de apostas em tempo real. `not null default ''` cobre linhas antigas;
 * inserts novos sempre informam o username (do `sub`/`preferred_username` do token).
 */
export class Migration20260620000200 extends Migration {
  override up(): void {
    this.addSql(
      `alter table "bet" add column "username" varchar(255) not null default '';`,
    );
  }

  override down(): void {
    this.addSql(`alter table "bet" drop column "username";`);
  }
}
