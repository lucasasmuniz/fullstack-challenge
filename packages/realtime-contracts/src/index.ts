/**
 * Contratos dos eventos WebSocket (server→client), compartilhados entre os serviços e o frontend.
 * Dinheiro no fio = `number` (centavos), multiplicador inteiro ×100, timestamps ISO-8601.
 *
 * Duas regras não-óbvias:
 * - Segredos: `round:opened`/`started`/`tick` nunca carregam `crashPointX100` nem `serverSeed` —
 *   só `round:crashed` os revela (revelar antes entregaria o resultado).
 * - Dead reckoning: em `round:tick` a autoridade é `elapsedMs` (desde `startedAt`), não
 *   `multiplierX100` — o cliente anima pela curva a partir do tempo; `multiplierX100` é só display.
 *   O único override absoluto é `round:crashed`.
 */

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

export const PUBLIC_ROOM = "spectators";
export function userRoom(playerId: string): string {
  return `user:${playerId}`;
}

export interface RoundOpenedPayload {
  readonly roundId: string;
  readonly roundNumber: number;
  readonly serverSeedHash: string;
  readonly publicSeed: string;
  readonly bettingEndsAt: string;
}

export interface RoundStartedPayload {
  readonly roundId: string;
  readonly startedAt: string;
  readonly growthRate: number;
}

export interface RoundTickPayload {
  readonly roundId: string;
  readonly elapsedMs: number;
  readonly multiplierX100: number;
}

export interface RoundCrashedPayload {
  readonly roundId: string;
  readonly crashPointX100: number;
  readonly serverSeed: string;
  readonly publicSeed: string;
  readonly crashedAt: string;
}

export interface RoundSettledPayload {
  readonly roundId: string;
  readonly settledAt: string;
}

export type BetStatusWire =
  | "PENDING_FUNDS"
  | "CONFIRMED"
  | "REJECTED"
  | "CASHED_OUT"
  | "LOST"
  | "REFUNDED";

export interface BetPlacedPayload {
  readonly betId: string;
  readonly roundId: string;
  readonly username: string;
  readonly amountCents: number;
  readonly status: BetStatusWire;
}

/** Transição de uma aposta, casada por `betId`. `username` é opcional (incluído só quando barato). */
export interface BetUpdatedPayload {
  readonly betId: string;
  readonly roundId: string;
  readonly username?: string;
  readonly status: BetStatusWire;
  readonly cashoutMultiplierX100?: number;
  readonly payoutCents?: number;
}

export interface BalanceUpdatedPayload {
  readonly balanceCents: number;
  readonly currency: string;
}

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
