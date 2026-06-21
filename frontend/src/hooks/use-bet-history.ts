import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import type { BetStatusWire } from "@crash-game/realtime-contracts";

export interface BetHistoryItem {
  readonly id: string;
  readonly roundId: string;
  readonly username: string;
  readonly amountCents: number;
  readonly status: BetStatusWire;
  readonly autoCashoutTargetX100: number | null;
  readonly cashoutMultiplierX100: number | null;
  readonly payoutCents: number | null;
  readonly placedAt: string;
  readonly resolvedAt: string | null;
}

interface Paginated<T> {
  readonly items: T[];
}

/** Histórico de apostas do jogador (REST, paginado). */
export function useBetHistory(limit = 30, enabled = true) {
  return useQuery({
    queryKey: ["bets", "me", limit],
    queryFn: () =>
      apiFetch<Paginated<BetHistoryItem>>(`/games/bets/me?limit=${limit}&offset=0`),
    enabled,
  });
}
