import {
  type BetPlacedPayload,
  type BetStatusWire,
  type BetUpdatedPayload,
  type RoundCrashedPayload,
  type RoundOpenedPayload,
  type RoundSettledPayload,
  type RoundStartedPayload,
  type RoundTickPayload,
} from "@crash-game/realtime-contracts";
import type { Bet, Round } from "../domain";

/**
 * Builders puros Round → payload WS (sala pública). Centraliza a **regra de vazamento**: os
 * payloads pré-crash (`opened`/`started`/`tick`) **nunca** carregam `crashPointX100`/`serverSeed`.
 */

export function roundOpenedPayload(round: Round): RoundOpenedPayload {
  return {
    roundId: round.id,
    roundNumber: round.roundNumber,
    serverSeedHash: round.serverSeedHash,
    publicSeed: round.publicSeed,
    bettingEndsAt: round.bettingEndsAt.toISOString(),
  };
}

export function roundStartedPayload(
  round: Round,
  startedAt: Date,
  growthRate: number,
): RoundStartedPayload {
  return {
    roundId: round.id,
    startedAt: startedAt.toISOString(),
    growthRate,
  };
}

/** `elapsedMs` é a autoridade (Dead Reckoning); `multiplierX100` vai por conveniência. */
export function roundTickPayload(
  roundId: string,
  elapsedMs: number,
  multiplierX100: number,
): RoundTickPayload {
  return { roundId, elapsedMs, multiplierX100 };
}

export function roundCrashedPayload(round: Round): RoundCrashedPayload {
  return {
    roundId: round.id,
    crashPointX100: round.crashPointX100,
    serverSeed: round.getServerSeed(),
    publicSeed: round.publicSeed,
    crashedAt: (round.crashedAt ?? new Date()).toISOString(),
  };
}

export function roundSettledPayload(round: Round): RoundSettledPayload {
  return {
    roundId: round.id,
    settledAt: (round.settledAt ?? new Date()).toISOString(),
  };
}

/** Aposta nova (PENDING_FUNDS) — carrega o `username` para a lista da rodada. */
export function betPlacedPayload(bet: Bet): BetPlacedPayload {
  return {
    betId: bet.id,
    roundId: bet.roundId,
    username: bet.username,
    amountCents: Number(bet.amount.toCents()),
    status: bet.status,
  };
}

/** Transição com o agregado em mãos (cashout) — inclui `username` e os campos de saque. */
export function betUpdatedFromBet(bet: Bet): BetUpdatedPayload {
  return {
    betId: bet.id,
    roundId: bet.roundId,
    username: bet.username,
    status: bet.status,
    cashoutMultiplierX100: bet.cashoutMultiplierX100 ?? undefined,
    payoutCents:
      bet.payout !== null ? Number(bet.payout.toCents()) : undefined,
  };
}

/** Transição no caminho da saga (confirm/reject/refund) — casada por `betId`, sem `username`. */
export function betUpdatedFromSaga(
  betId: string,
  roundId: string,
  status: BetStatusWire,
): BetUpdatedPayload {
  return { betId, roundId, status };
}
