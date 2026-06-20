import type { BetStatus } from "../domain";

/**
 * Projeção de leitura de uma aposta para `GET /bets/me` (não hidrata o agregado `Bet`).
 * Lado de **query** do CQRS — separado do `BetRepository` (escrita/agregado), ADR 0012.
 */
export interface BetView {
  readonly id: string;
  readonly roundId: string;
  readonly amountCents: bigint;
  readonly status: BetStatus;
  readonly autoCashoutTargetX100: number | null;
  readonly cashoutMultiplierX100: number | null;
  readonly payoutCents: bigint | null;
  readonly placedAt: Date;
  readonly resolvedAt: Date | null;
}

/** Port de leitura das apostas (read model). Implementado pelo adapter MikroORM. */
export interface BetQueryRepository {
  findByPlayer(
    playerId: string,
    limit: number,
    offset: number,
  ): Promise<BetView[]>;
}

export const BET_QUERY_REPOSITORY = Symbol("BET_QUERY_REPOSITORY");
