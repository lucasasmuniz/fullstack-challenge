import type { LeaderboardEntry } from "../../application/leaderboard-query.repository";

/** Item do ranking exposto na API (com `rank` 1-based). `playerId` não é exposto (privacidade). */
export interface LeaderboardEntryDto {
  readonly rank: number;
  readonly username: string;
  readonly profitCents: number;
  readonly betsCount: number;
}

export interface LeaderboardDto {
  readonly period: string;
  readonly items: LeaderboardEntryDto[];
}

export function toLeaderboardDto(
  period: string,
  entries: LeaderboardEntry[],
): LeaderboardDto {
  return {
    period,
    items: entries.map((e, i) => ({
      rank: i + 1,
      username: e.username,
      profitCents: e.profitCents,
      betsCount: e.betsCount,
    })),
  };
}
