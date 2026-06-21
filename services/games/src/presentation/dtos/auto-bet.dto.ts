import type { AutoBetSession } from "../../domain";

/** Resposta REST da sessão de auto-bet — centavos como `number` (safe-integer na borda). */
export interface AutoBetSessionDto {
  readonly id: string;
  readonly status: string;
  readonly strategy: string;
  readonly baseAmountCents: number;
  readonly nextAmountCents: number;
  readonly autoCashoutTargetX100: number;
  readonly stopLossCents: number;
  readonly budgetCents: number;
  readonly stopWinCents: number | null;
  readonly maxRounds: number | null;
  readonly roundsPlayed: number;
  readonly netResultCents: number;
  readonly totalWageredCents: number;
  readonly completionReason: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export function toAutoBetSessionDto(s: AutoBetSession): AutoBetSessionDto {
  return {
    id: s.id,
    status: s.status,
    strategy: s.strategy,
    baseAmountCents: Number(s.baseAmount.toCents()),
    nextAmountCents: Number(s.nextAmount.toCents()),
    autoCashoutTargetX100: s.autoCashoutTargetX100,
    stopLossCents: Number(s.stopLoss.toCents()),
    budgetCents: Number(s.budget.toCents()),
    stopWinCents: s.stopWin ? Number(s.stopWin.toCents()) : null,
    maxRounds: s.maxRounds,
    roundsPlayed: s.roundsPlayed,
    netResultCents: Number(s.netResultCents),
    totalWageredCents: Number(s.totalWageredCents),
    completionReason: s.completionReason,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}
