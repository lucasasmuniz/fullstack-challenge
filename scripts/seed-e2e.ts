/**
 * seed:e2e — semeia um estado reproduzível para o e2e cross-service / demo (bônus B5).
 *
 * O determinismo do **jogo** (crash em ponto fixo) vem da env `GAME_FIXED_CRASH_X100`
 * (ver `docker-compose.e2e.yml`); este script cuida do **dinheiro**: garante que a carteira
 * do jogador de teste exista e esteja financiada acima de um **piso conhecido**, de forma
 * **idempotente e convergente** — rodar N vezes nunca passa do piso, e runs que drenam o
 * saldo (apostas perdidas) podem rechamar para reabastecer.
 *
 * Dirige a **API pública via Kong** (mesma porta de entrada do jogador), sem tocar no banco:
 * sem race com o engine, respeitando os invariantes da carteira (event-sourced).
 *
 * Uso: `bun run seed:e2e`  (requer a stack de pé — `docker:up`/`docker:rebuild`).
 * Envs: `KONG_URL` (default http://localhost:8000), `KEYCLOAK_URL` (default http://localhost:8080),
 *       `SEED_BALANCE_FLOOR_CENTS` (default 100000 = 1.000,00), credenciais do `player`.
 */
import { randomUUID } from "node:crypto";

const KONG_URL = process.env.KONG_URL ?? "http://localhost:8000";
const KEYCLOAK_URL = process.env.KEYCLOAK_URL ?? "http://localhost:8080";
const FLOOR_CENTS = Number(process.env.SEED_BALANCE_FLOOR_CENTS ?? "100000");
const PLAYER_USERNAME = process.env.SEED_PLAYER_USERNAME ?? "player";
const PLAYER_PASSWORD = process.env.SEED_PLAYER_PASSWORD ?? "player123";
const CLIENT_ID = process.env.SEED_CLIENT_ID ?? "crash-game-client";

interface WalletResponse {
  balanceCents: number;
}

async function getPlayerToken(): Promise<string> {
  const res = await fetch(
    `${KEYCLOAK_URL}/realms/crash-game/protocol/openid-connect/token`,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "password",
        client_id: CLIENT_ID,
        username: PLAYER_USERNAME,
        password: PLAYER_PASSWORD,
      }),
    },
  );
  const body = (await res.json()) as { access_token?: string };
  if (!res.ok || !body.access_token) {
    throw new Error(`Falha ao obter token do '${PLAYER_USERNAME}' (status ${res.status}).`);
  }
  return body.access_token;
}

async function ensureWallet(token: string): Promise<WalletResponse> {
  const auth = { authorization: `Bearer ${token}` };
  const me = await fetch(`${KONG_URL}/wallets/me`, { headers: auth });
  if (me.ok) {
    return (await me.json()) as WalletResponse;
  }
  if (me.status !== 404) {
    throw new Error(`GET /wallets/me inesperado (status ${me.status}).`);
  }
  // 404 → ainda não existe: cria.
  const created = await fetch(`${KONG_URL}/wallets`, { method: "POST", headers: auth });
  if (!created.ok) {
    throw new Error(`POST /wallets falhou (status ${created.status}).`);
  }
  return (await created.json()) as WalletResponse;
}

async function topUpToFloor(token: string, wallet: WalletResponse): Promise<void> {
  if (wallet.balanceCents >= FLOOR_CENTS) {
    console.log(
      `[seed:e2e] saldo já no piso: ${wallet.balanceCents} >= ${FLOOR_CENTS} cents — no-op.`,
    );
    return;
  }
  const gap = FLOOR_CENTS - wallet.balanceCents;
  const res = await fetch(`${KONG_URL}/wallets/deposit`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      // Key única por reabastecimento (idempotente no retry desta execução).
      "idempotency-key": randomUUID(),
    },
    body: JSON.stringify({ amountCents: gap }),
  });
  if (!res.ok) {
    throw new Error(`POST /wallets/deposit falhou (status ${res.status}).`);
  }
  const after = (await res.json()) as WalletResponse;
  console.log(
    `[seed:e2e] depósito de ${gap} cents → saldo ${after.balanceCents} (piso ${FLOOR_CENTS}).`,
  );
}

async function main(): Promise<void> {
  console.log(`[seed:e2e] Kong=${KONG_URL} Keycloak=${KEYCLOAK_URL} floor=${FLOOR_CENTS} cents`);
  const token = await getPlayerToken();
  const wallet = await ensureWallet(token);
  await topUpToFloor(token, wallet);
  console.log("[seed:e2e] estado reproduzível pronto ✅");
}

main().catch((err: unknown) => {
  console.error(`[seed:e2e] falhou: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
