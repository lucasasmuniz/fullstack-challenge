import { Migration } from "@mikro-orm/migrations";

/**
 * Auto-bet: tabela `auto_bet_session` (Process Manager state-stored). Dinheiro
 * em `bigint` centavos; `net_result_cents` assinado. **Índice único parcial** garante no máx.
 * uma sessão `ACTIVE` por jogador. Índice em `status` acelera a varredura do líder (`findActive`).
 */
export class Migration20260621000100 extends Migration {
  override up(): void {
    this.addSql(`
      create table "auto_bet_session" (
        "id" uuid not null,
        "player_id" uuid not null,
        "username" varchar(255) not null,
        "status" varchar(255) not null,
        "strategy" varchar(255) not null,
        "base_amount_cents" bigint not null,
        "next_amount_cents" bigint not null,
        "auto_cashout_target_x100" int not null,
        "stop_loss_cents" bigint not null,
        "budget_cents" bigint not null,
        "stop_win_cents" bigint null,
        "max_rounds" int null,
        "rounds_played" int not null,
        "net_result_cents" bigint not null,
        "total_wagered_cents" bigint not null,
        "current_round_id" uuid null,
        "current_bet_id" uuid null,
        "last_processed_round_id" uuid null,
        "completion_reason" varchar(255) null,
        "version" int not null,
        "created_at" timestamptz not null,
        "updated_at" timestamptz not null,
        constraint "auto_bet_session_pkey" primary key ("id")
      );
    `);
    this.addSql(
      `create index "auto_bet_session_player_id_index" on "auto_bet_session" ("player_id");`,
    );
    this.addSql(
      `create index "auto_bet_session_status_index" on "auto_bet_session" ("status");`,
    );
    this.addSql(
      `create unique index "auto_bet_session_one_active_per_player" on "auto_bet_session" ("player_id") where "status" = 'ACTIVE';`,
    );
  }

  override down(): void {
    this.addSql(`drop table if exists "auto_bet_session";`);
  }
}
