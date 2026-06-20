import type { Bet } from "../../domain";
import type { BetView } from "../../application/bet-query.repository";

/** Resposta de `POST /bet` — estado inicial da aposta (aguardando débito). */
export interface PlacedBetDto {
  readonly id: string;
  readonly roundId: string;
  readonly amountCents: number;
  readonly status: string;
  readonly autoCashoutTargetX100: number | null;
}

export function toPlacedBetDto(bet: Bet): PlacedBetDto {
  return {
    id: bet.id,
    roundId: bet.roundId,
    amountCents: Number(bet.amount.toCents()),
    status: bet.status,
    autoCashoutTargetX100: bet.autoCashoutTargetX100,
  };
}

/** Resposta de `POST /bet/cashout` — multiplicador e payout do saque. */
export interface CashedOutBetDto {
  readonly id: string;
  readonly roundId: string;
  readonly status: string;
  readonly cashoutMultiplierX100: number | null;
  readonly payoutCents: number | null;
}

export function toCashedOutBetDto(bet: Bet): CashedOutBetDto {
  return {
    id: bet.id,
    roundId: bet.roundId,
    status: bet.status,
    cashoutMultiplierX100: bet.cashoutMultiplierX100,
    payoutCents: bet.payout !== null ? Number(bet.payout.toCents()) : null,
  };
}

/** Item de `GET /bets/me` — projeção (centavos como `number` na borda). */
export interface BetHistoryDto {
  readonly id: string;
  readonly roundId: string;
  readonly amountCents: number;
  readonly status: string;
  readonly autoCashoutTargetX100: number | null;
  readonly cashoutMultiplierX100: number | null;
  readonly payoutCents: number | null;
  readonly placedAt: string;
  readonly resolvedAt: string | null;
}

export function toBetHistoryDto(view: BetView): BetHistoryDto {
  return {
    id: view.id,
    roundId: view.roundId,
    amountCents: Number(view.amountCents),
    status: view.status,
    autoCashoutTargetX100: view.autoCashoutTargetX100,
    cashoutMultiplierX100: view.cashoutMultiplierX100,
    payoutCents: view.payoutCents !== null ? Number(view.payoutCents) : null,
    placedAt: view.placedAt.toISOString(),
    resolvedAt: view.resolvedAt ? view.resolvedAt.toISOString() : null,
  };
}
