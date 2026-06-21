/** Linha do ranking — lucro líquido e nº de apostas resolvidas de um jogador na janela. */
export interface LeaderboardEntry {
  readonly playerId: string;
  readonly username: string;
  readonly profitCents: number;
  readonly betsCount: number;
}

/**
 * Port de leitura do leaderboard (CQRS). Agrega as apostas **resolvidas** (`CASHED_OUT`/`LOST`)
 * desde `since`, somando o lucro líquido (`payout − aposta`; LOST = `−aposta`) por jogador.
 */
export interface LeaderboardQueryRepository {
  topByProfit(since: Date, limit: number): Promise<LeaderboardEntry[]>;
}

export const LEADERBOARD_QUERY_REPOSITORY = Symbol("LEADERBOARD_QUERY_REPOSITORY");
