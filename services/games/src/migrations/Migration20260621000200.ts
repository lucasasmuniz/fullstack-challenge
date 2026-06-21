import { Migration } from "@mikro-orm/migrations";

/**
 * Leaderboard: **covering index** para a agregação do ranking. A query filtra por
 * `(status, resolved_at)` e soma `payout_cents`/`amount_cents` por jogador. O `INCLUDE`
 * (colunas-payload na folha do índice) permite responder por **Index-Only Scan**, sem heap fetch.
 */
export class Migration20260621000200 extends Migration {
  override up(): void {
    this.addSql(
      `create index "idx_bet_leaderboard" on "bet" ("status", "resolved_at") ` +
        `include ("player_id", "username", "payout_cents", "amount_cents");`,
    );
  }

  override down(): void {
    this.addSql(`drop index if exists "idx_bet_leaderboard";`);
  }
}
