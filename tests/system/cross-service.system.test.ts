import { beforeAll, describe, expect, it } from "bun:test";

/**
 * System-test cross-service (future-work #3): exercita o fluxo de dinheiro ponta-a-ponta
 * **através do Kong**, com os dois serviços (games + wallets) de pé e comunicando via SQS.
 * É o e2e que o README lista como obrigatório (aposta→débito→cashout→saldo; aposta→crash→perda;
 * saldo insuficiente→REJECTED) e que ficou adiado por exigir um crash determinístico — agora
 * destravado pelo bônus B5 (`GAME_FIXED_CRASH_X100`, ver `docker-compose.e2e.yml`).
 *
 * Pré-requisito: `bun run docker:e2e` (sobe a stack com crash fixo em 2,00x) + `bun run seed:e2e`
 * (financia o jogador). Opt-in via `RUN_SYSTEM_E2E=1` (`bun run test:system`) para não rodar no
 * `bun test` da raiz, que não tem a stack no ar.
 */
const KONG_URL = process.env.KONG_URL ?? "http://localhost:8000";
const KEYCLOAK_URL = process.env.KEYCLOAK_URL ?? "http://localhost:8080";
const BET_CENTS = Number(process.env.SYSTEM_BET_CENTS ?? "2000");
const FIXED_CRASH_X100 = Number(process.env.GAME_FIXED_CRASH_X100 ?? "200");

const describeSystem = process.env.RUN_SYSTEM_E2E ? describe : describe.skip;

let token: string;

async function getPlayerToken(): Promise<string> {
  const res = await fetch(
    `${KEYCLOAK_URL}/realms/crash-game/protocol/openid-connect/token`,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "password",
        client_id: "crash-game-client",
        username: "player",
        password: "player123",
      }),
    },
  );
  const body = (await res.json()) as { access_token?: string };
  if (!body.access_token) {
    throw new Error(`Falha ao obter token (status ${res.status}).`);
  }
  return body.access_token;
}

function auth(): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${KONG_URL}${path}`, { headers: auth() });
  if (!res.ok) {
    throw new Error(`GET ${path} → ${res.status}`);
  }
  return (await res.json()) as T;
}

async function balanceCents(): Promise<number> {
  const w = await getJson<{ balanceCents: number }>("/wallets/me");
  return w.balanceCents;
}

interface CurrentRound {
  id: string;
  status: string;
}

interface BetHistoryItem {
  id: string;
  roundId: string;
  status: string;
  cashoutMultiplierX100: number | null;
  payoutCents: number | null;
}

async function betStatus(betId: string): Promise<BetHistoryItem | undefined> {
  const page = await getJson<{ items: BetHistoryItem[] }>("/games/bets/me?limit=50");
  return page.items.find((b) => b.id === betId);
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Espera (com timeout) `predicate(value)` virar verdade, repolando `fn` a cada `intervalMs`. */
async function poll<T>(
  fn: () => Promise<T>,
  predicate: (v: T) => boolean,
  label: string,
  timeoutMs = 30000,
  intervalMs = 200,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last: T;
  do {
    last = await fn();
    if (predicate(last)) {
      return last;
    }
    await sleep(intervalMs);
  } while (Date.now() < deadline);
  throw new Error(`Timeout aguardando '${label}' (último: ${JSON.stringify(last!)}).`);
}

/**
 * Coloca uma aposta numa rodada **fresca** em BETTING (id != `avoidRoundId`), com retry: se a
 * janela fechou no instante do POST (409), tenta na próxima rodada. Retorna {betId, roundId}.
 */
async function placeBetFreshRound(
  avoidRoundId: string | null,
  autoCashoutTargetX100: number | null = null,
): Promise<{ betId: string; roundId: string }> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const round = await poll(
      () => getJson<CurrentRound | null>("/games/rounds/current"),
      (r) => r !== null && r.status === "BETTING" && r.id !== avoidRoundId,
      "rodada fresca em BETTING",
    );
    if (round === null) {
      continue; // inalcançável (o predicate exige não-null), mas estreita o tipo p/ o tsc
    }
    const res = await fetch(`${KONG_URL}/games/bet`, {
      method: "POST",
      headers: { ...auth(), "content-type": "application/json" },
      body: JSON.stringify({ amountCents: BET_CENTS, autoCashoutTargetX100 }),
    });
    if (res.status === 201) {
      const bet = (await res.json()) as { id: string; roundId: string };
      return { betId: bet.id, roundId: bet.roundId };
    }
    if (res.status === 409) {
      // Janela fechou / aposta dupla nesta rodada: espera a rodada virar e tenta a próxima.
      avoidRoundId = round.id;
      await sleep(500);
      continue;
    }
    throw new Error(`POST /games/bet inesperado: ${res.status}`);
  }
  throw new Error("Não consegui colocar aposta numa rodada fresca após várias tentativas.");
}

describeSystem("Cross-service money flow (Kong + SQS, crash fixo)", () => {
  beforeAll(async () => {
    token = await getPlayerToken();
    // Garante o jogador financiado (idempotente) — robusto a runs anteriores que drenaram saldo.
    const bal = await balanceCents();
    if (bal < BET_CENTS * 4) {
      await fetch(`${KONG_URL}/wallets/deposit`, {
        method: "POST",
        headers: {
          ...auth(),
          "content-type": "application/json",
          "idempotency-key": crypto.randomUUID(),
        },
        body: JSON.stringify({ amountCents: BET_CENTS * 10 }),
      });
    }
  });

  it(
    "aposta → débito (SQS) → cashout → crédito (saldo atualizado)",
    async () => {
      const before = await balanceCents();

      const { betId, roundId } = await placeBetFreshRound(null);

      // Débito cross-service aplicado (saldo cai pelo valor da aposta).
      await poll(
        () => balanceCents(),
        (b) => b === before - BET_CENTS,
        "débito da aposta refletido no saldo",
      );

      // Aposta CONFIRMED (débito confirmado) antes de tentar o cashout.
      await poll(
        () => betStatus(betId),
        (b) => b?.status === "CONFIRMED",
        "aposta CONFIRMED",
      );

      // Espera a rodada entrar em RUNNING e saca antes do crash fixo (2,00x).
      await poll(
        () => getJson<CurrentRound | null>("/games/rounds/current"),
        (r) => r !== null && r.id === roundId && r.status === "RUNNING",
        "rodada RUNNING",
      );
      const cashoutRes = await fetch(`${KONG_URL}/games/bet/cashout`, {
        method: "POST",
        headers: auth(),
      });
      expect(cashoutRes.status).toBe(200);
      const cashout = (await cashoutRes.json()) as {
        status: string;
        cashoutMultiplierX100: number | null;
        payoutCents: number | null;
      };
      expect(cashout.status).toBe("CASHED_OUT");
      expect(cashout.cashoutMultiplierX100).not.toBeNull();
      expect(cashout.cashoutMultiplierX100!).toBeLessThan(FIXED_CRASH_X100);
      expect(cashout.payoutCents).not.toBeNull();
      const payout = cashout.payoutCents!;
      expect(payout).toBeGreaterThanOrEqual(BET_CENTS);

      // Crédito cross-service aplicado (saldo sobe pelo payout).
      await poll(
        () => balanceCents(),
        (b) => b === before - BET_CENTS + payout,
        "crédito do cashout refletido no saldo",
      );

      // Estado final da aposta: CASHED_OUT.
      const finalBet = await betStatus(betId);
      expect(finalBet?.status).toBe("CASHED_OUT");
    },
    90000,
  );

  it(
    "aposta → crash sem saque → LOST (aposta perdida, débito mantido)",
    async () => {
      const before = await balanceCents();

      const { betId, roundId } = await placeBetFreshRound(null);

      await poll(
        () => balanceCents(),
        (b) => b === before - BET_CENTS,
        "débito da aposta refletido no saldo",
      );

      // NÃO saca: espera o crash + settlement marcar a aposta como LOST.
      await poll(
        () => betStatus(betId),
        (b) => b?.status === "LOST",
        "aposta LOST após o crash",
        40000,
      );

      // Saldo mantém o débito (sem crédito); a rodada já terminou.
      expect(await balanceCents()).toBe(before - BET_CENTS);
      const round = await getJson<CurrentRound | null>("/games/rounds/current");
      // A rodada corrente já é outra (ou esta terminou) — apenas sanity de que não travou.
      expect(round === null || round.id !== roundId || round.status !== "BETTING").toBe(true);
    },
    90000,
  );

  it(
    "auto-cashout (B2): saca sozinho no alvo (< crash fixo) e credita o payout do alvo",
    async () => {
      const before = await balanceCents();
      const TARGET = 150; // 1,50x — abaixo do crash fixo (2,00x) → o servidor saca sozinho

      const { betId } = await placeBetFreshRound(null, TARGET);

      // Débito cross-service.
      await poll(
        () => balanceCents(),
        (b) => b === before - BET_CENTS,
        "débito da aposta refletido no saldo",
      );

      // SEM cashout manual: o scheduler (líder) saca no alvo quando o multiplicador o cruza.
      const cashed = await poll(
        () => betStatus(betId),
        (b) => b?.status === "CASHED_OUT",
        "auto-cashout marcou CASHED_OUT",
        40000,
      );
      expect(cashed?.cashoutMultiplierX100).toBe(TARGET); // sacou no ALVO, não no tick

      // Payout do alvo = floor(aposta × 150 / 100), creditado cross-service.
      const expectedPayout = Math.floor((BET_CENTS * TARGET) / 100);
      expect(cashed?.payoutCents).toBe(expectedPayout);
      await poll(
        () => balanceCents(),
        (b) => b === before - BET_CENTS + expectedPayout,
        "crédito do auto-cashout refletido no saldo",
      );
    },
    90000,
  );

  it(
    "auto-bet (B3): o servidor aposta sozinho a cada rodada e encerra no freio max-rounds",
    async () => {
      // Higiene: garante que não há sessão ativa de um run anterior.
      await fetch(`${KONG_URL}/games/autobet/stop`, { method: "POST", headers: auth() });

      // Alvo 1,50x < crash fixo 2,00x → cada rodada vence (auto-cashout). maxRounds=2 → encerra
      // deterministicamente após 2 vitórias.
      const start = await fetch(`${KONG_URL}/games/autobet`, {
        method: "POST",
        headers: { ...auth(), "content-type": "application/json" },
        body: JSON.stringify({
          strategy: "MARTINGALE",
          baseAmountCents: 100,
          autoCashoutTargetX100: 150,
          stopLossCents: 100000,
          budgetCents: 100000,
          maxRounds: 2,
        }),
      });
      expect(start.status).toBe(201);

      // O runner (líder) coloca uma aposta por rodada; após 2 vitórias a sessão fica COMPLETED.
      const session = await poll(
        () => getJson<{ status: string; roundsPlayed: number; completionReason: string | null; netResultCents: number }>("/games/autobet/me").catch(() => null),
        (s) => s !== null && s.status === "COMPLETED",
        "sessão de auto-bet encerrada (COMPLETED)",
        60000,
      );
      expect(session?.completionReason).toBe("MAX_ROUNDS");
      expect(session?.roundsPlayed).toBe(2);
      // 2 vitórias de 100 @1,50x → lucro líquido = 2 × (150 − 100) = 100.
      expect(session?.netResultCents).toBe(100);
    },
    120000,
  );

  it(
    "aposta sem saldo → REJECTED (débito recusado pela Wallet, saldo nunca negativo)",
    async () => {
      // Higiene: encerra qualquer sessão de auto-bet para ninguém apostar por baixo dos panos
      // e mexer no saldo durante este cenário.
      await fetch(`${KONG_URL}/games/autobet/stop`, { method: "POST", headers: auth() });

      // Drena o saldo para 0 (withdraw idempotente do saldo atual) → o próximo débito é recusado.
      const bal = await balanceCents();
      if (bal > 0) {
        const drain = await fetch(`${KONG_URL}/wallets/withdraw`, {
          method: "POST",
          headers: {
            ...auth(),
            "content-type": "application/json",
            "idempotency-key": crypto.randomUUID(),
          },
          body: JSON.stringify({ amountCents: bal }),
        });
        expect(drain.status).toBe(200);
      }
      expect(await balanceCents()).toBe(0);

      // O POST /bet é aceito (201, PENDING_FUNDS): o débito é assíncrono (saga SQS), não síncrono.
      const { betId } = await placeBetFreshRound(null);

      // A Wallet recusa o débito (saldo insuficiente) → FundsDebitRejected → a aposta vira REJECTED.
      const rejected = await poll(
        () => betStatus(betId),
        (b) => b?.status === "REJECTED",
        "aposta REJECTED por saldo insuficiente",
        40000,
      );
      expect(rejected?.status).toBe("REJECTED");
      // Invariante monetária: nada foi debitado, o saldo continua 0 (nunca negativo).
      expect(await balanceCents()).toBe(0);

      // Restaura o saldo para não afetar re-execuções da suíte (idempotente/convergente).
      await fetch(`${KONG_URL}/wallets/deposit`, {
        method: "POST",
        headers: {
          ...auth(),
          "content-type": "application/json",
          "idempotency-key": crypto.randomUUID(),
        },
        body: JSON.stringify({ amountCents: BET_CENTS * 10 }),
      });
    },
    90000,
  );
});
