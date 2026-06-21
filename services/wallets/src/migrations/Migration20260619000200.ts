import { Migration } from "@mikro-orm/migrations";

/**
 * Seed do usuário de teste financiado. O `player_id` é o **mesmo UUID** fixado
 * no `player` em `docker/keycloak/realm-export.json` (sub determinístico) — assim a
 * carteira semeada bate com o `sub` do JWT. Modelado como eventos do ledger
 * (`WalletCreated` v1 + `FundsCredited` reason=initial v2) + projeção de saldo.
 *
 * Saldo inicial: 100000 centavos = 1.000,00. Roda uma vez no `docker:up` (zero-manual).
 */
const PLAYER_ID = "11111111-1111-4111-8111-111111111111";
const WALLET_ID = "22222222-2222-4222-8222-222222222222";
const INITIAL_CENTS = 100000;

export class Migration20260619000200 extends Migration {
  override up(): void {
    this.addSql(`
      insert into "wallet"
        ("id", "player_id", "balance_cents", "version", "currency", "created_at", "updated_at")
      values
        ('${WALLET_ID}', '${PLAYER_ID}', ${INITIAL_CENTS}, 2, 'BRL', now(), now());
    `);

    this.addSql(`
      insert into "wallet_event"
        ("id", "wallet_id", "version", "type", "amount_cents", "reason", "correlation_id", "metadata", "occurred_at")
      values
        (gen_random_uuid(), '${WALLET_ID}', 1, 'WalletCreated', 0, null, null,
         '{"playerId":"${PLAYER_ID}","currency":"BRL"}'::jsonb, now()),
        (gen_random_uuid(), '${WALLET_ID}', 2, 'FundsCredited', ${INITIAL_CENTS}, 'initial', 'seed-initial-player', null, now());
    `);
  }

  override down(): void {
    this.addSql(`delete from "wallet_event" where "wallet_id" = '${WALLET_ID}';`);
    this.addSql(`delete from "wallet" where "id" = '${WALLET_ID}';`);
  }
}
