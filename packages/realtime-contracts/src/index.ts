/**
 * `@crash-game/realtime-contracts` — contratos dos **eventos WebSocket** (server→client),
 * compartilhados entre os serviços (Game/Wallet) e o frontend. Mantém os dois lados acordados
 * na MESMA forma de evento (mesma ideia de `@crash-game/contracts` para o SQS).
 *
 * **Dinheiro no fio = `number` (centavos inteiros)**, nunca `bigint` (JSON). Multiplicador é
 * inteiro ×100 (`247` = `2.47x`). Timestamps são ISO-8601 (`string`).
 *
 * **Segredos:** `round:opened`/`round:started`/`round:tick` **nunca** carregam `crashPointX100`
 * nem `serverSeed` — revelá-los antes do crash entregaria o resultado. Eles só aparecem em
 * `round:crashed` (e na leitura de histórico/verify). Mesma regra do `CurrentRoundDto`.
 *
 * **Dead Reckoning (Risco 1):** em `round:tick`, a **autoridade é `elapsedMs`** (tempo decorrido
 * desde `startedAt`), NÃO o `multiplierX100`. O cliente anima o multiplicador pela curva
 * (`@crash-game/curve`) a partir do tempo local suavizado, reconciliando `elapsedMs` de forma
 * suave; `multiplierX100` vai só por conveniência (display/log) e **não deve** sobrescrever
 * abruptamente o valor na tela. O único override absoluto é `round:crashed`.
 */

/** Nomes dos eventos emitidos pelo servidor. */
export const RealtimeEvent = {
  RoundOpened: "round:opened",
  RoundStarted: "round:started",
  RoundTick: "round:tick",
  RoundCrashed: "round:crashed",
  RoundSettled: "round:settled",
  BetPlaced: "bet:placed",
  BetUpdated: "bet:updated",
  BalanceUpdated: "balance:updated",
} as const;
export type RealtimeEvent = (typeof RealtimeEvent)[keyof typeof RealtimeEvent];

/** Salas (rooms) do socket.io. A pública recebe todo evento de jogo; a privada, por jogador. */
export const PUBLIC_ROOM = "spectators";
export function userRoom(playerId: string): string {
  return `user:${playerId}`;
}

// ---- Rodada (sala pública) -------------------------------------------------

/** Nova rodada aberta — fase de apostas. Sem segredos. */
export interface RoundOpenedPayload {
  readonly roundId: string;
  readonly roundNumber: number;
  readonly serverSeedHash: string;
  readonly publicSeed: string;
  readonly bettingEndsAt: string;
}

/** Rodada iniciou (RUNNING) — sinal para o cliente começar a animar a curva. */
export interface RoundStartedPayload {
  readonly roundId: string;
  readonly startedAt: string;
  readonly growthRate: number;
}

/**
 * Resync do multiplicador durante RUNNING. **Autoridade = `elapsedMs`** (ver header).
 * `multiplierX100` é conveniência (não-autoritativo para animação).
 */
export interface RoundTickPayload {
  readonly roundId: string;
  readonly elapsedMs: number;
  readonly multiplierX100: number;
}

/** Crash — revela `crashPointX100` + `serverSeed` (provably fair). Encerra o Dead Reckoning. */
export interface RoundCrashedPayload {
  readonly roundId: string;
  readonly crashPointX100: number;
  readonly serverSeed: string;
  readonly publicSeed: string;
  readonly crashedAt: string;
}

/** Rodada liquidada — apostas não sacadas já foram marcadas LOST. */
export interface RoundSettledPayload {
  readonly roundId: string;
  readonly settledAt: string;
}

// ---- Apostas (sala pública) ------------------------------------------------

/** Status de aposta no fio (espelha o domínio `BetStatus`). */
export type BetStatusWire =
  | "PENDING_FUNDS"
  | "CONFIRMED"
  | "REJECTED"
  | "CASHED_OUT"
  | "LOST"
  | "REFUNDED";

/** Aposta nova entrou (PENDING_FUNDS) — alimenta a lista da rodada atual. */
export interface BetPlacedPayload {
  readonly betId: string;
  readonly roundId: string;
  readonly username: string;
  readonly amountCents: number;
  readonly status: BetStatusWire;
}

/**
 * Transição de uma aposta (confirm/reject/cashout/refund). É casada por `betId` no cliente
 * (que já recebeu o `username` no `bet:placed`), então `username` é **opcional** — incluído
 * quando barato (cashout, que tem o agregado), omitido no caminho da saga. Campos de saque só
 * em CASHED_OUT.
 */
export interface BetUpdatedPayload {
  readonly betId: string;
  readonly roundId: string;
  readonly username?: string;
  readonly status: BetStatusWire;
  readonly cashoutMultiplierX100?: number;
  readonly payoutCents?: number;
}

// ---- Saldo (sala privada user:{sub}) ---------------------------------------

/** Novo saldo do jogador após crédito/débito. Só para a sala privada (autenticado). */
export interface BalanceUpdatedPayload {
  readonly balanceCents: number;
  readonly currency: string;
}

// ---- Mapa type → payload (tipagem do emissor/consumidor) -------------------

export interface RealtimeEventPayloads {
  [RealtimeEvent.RoundOpened]: RoundOpenedPayload;
  [RealtimeEvent.RoundStarted]: RoundStartedPayload;
  [RealtimeEvent.RoundTick]: RoundTickPayload;
  [RealtimeEvent.RoundCrashed]: RoundCrashedPayload;
  [RealtimeEvent.RoundSettled]: RoundSettledPayload;
  [RealtimeEvent.BetPlaced]: BetPlacedPayload;
  [RealtimeEvent.BetUpdated]: BetUpdatedPayload;
  [RealtimeEvent.BalanceUpdated]: BalanceUpdatedPayload;
}
