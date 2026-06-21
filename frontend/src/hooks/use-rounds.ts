import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import type { RoundPhase } from "@/stores/game-store";

export interface CurrentRoundDto {
  readonly id: string;
  readonly roundNumber: number;
  readonly status: RoundPhase;
  readonly serverSeedHash: string;
  readonly publicSeed: string;
  readonly bettingEndsAt: string;
  readonly startedAt: string | null;
  readonly growthRate: number;
}

export interface HistoryRoundDto {
  readonly id: string;
  readonly roundNumber: number;
  readonly crashPointX100: number;
  readonly serverSeed: string;
  readonly serverSeedHash: string;
  readonly publicSeed: string;
  readonly crashedAt: string | null;
}

interface Paginated<T> {
  readonly items: T[];
}

export const roundKeys = {
  current: ["rounds", "current"] as const,
  history: (limit: number) => ["rounds", "history", limit] as const,
};

/** Rodada corrente (seed inicial da tela antes do 1º evento WS). */
export function useCurrentRound() {
  return useQuery({
    queryKey: roundKeys.current,
    queryFn: () => apiFetch<CurrentRoundDto | null>("/games/rounds/current"),
  });
}

/** Histórico recente para o strip de pílulas. */
export function useRoundHistory(limit = 24) {
  return useQuery({
    queryKey: roundKeys.history(limit),
    queryFn: () =>
      apiFetch<Paginated<HistoryRoundDto>>(
        `/games/rounds/history?limit=${limit}&offset=0`,
      ),
  });
}
