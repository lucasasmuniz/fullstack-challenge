import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

export type LeaderboardPeriod = "24h" | "week";

export interface LeaderboardEntry {
  readonly rank: number;
  readonly username: string;
  readonly profitCents: number;
  readonly betsCount: number;
}

interface LeaderboardDto {
  readonly period: LeaderboardPeriod;
  readonly items: LeaderboardEntry[];
}

/** Top jogadores por lucro líquido na janela (24h/semana). */
export function useLeaderboard(period: LeaderboardPeriod, enabled = true) {
  return useQuery({
    queryKey: ["leaderboard", period],
    queryFn: () => apiFetch<LeaderboardDto>(`/games/leaderboard?period=${period}`),
    enabled,
    staleTime: 15_000,
  });
}
