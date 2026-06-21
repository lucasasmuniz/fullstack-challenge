"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch, ApiError } from "@/lib/api";

export type AutoBetStrategy = "FIXED" | "MARTINGALE";
export type AutoBetStatus = "ACTIVE" | "COMPLETED" | "STOPPED";

export interface AutoBetSessionDto {
  readonly id: string;
  readonly status: AutoBetStatus;
  readonly strategy: AutoBetStrategy;
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
}

export interface AutoBetConfig {
  strategy: AutoBetStrategy;
  baseAmountCents: number;
  autoCashoutTargetX100: number;
  stopLossCents: number;
  budgetCents: number;
  stopWinCents?: number | null;
  maxRounds?: number | null;
}

const KEY = ["autobet", "me"] as const;

/**
 * Sessão de auto-bet (server-side, dirigida pelo líder). O `/me` é polado a cada 1,5s enquanto a
 * sessão está ACTIVE — assim o P&L/rodadas/próxima aposta acompanham a execução no servidor.
 */
export function useAutoBet(enabled: boolean) {
  const queryClient = useQueryClient();

  const session = useQuery({
    queryKey: KEY,
    queryFn: () => apiFetch<AutoBetSessionDto | null>("/games/autobet/me"),
    enabled,
    refetchInterval: (query) =>
      query.state.data?.status === "ACTIVE" ? 1500 : false,
  });

  const start = useMutation({
    mutationFn: (cfg: AutoBetConfig) =>
      apiFetch<AutoBetSessionDto>("/games/autobet", {
        method: "POST",
        body: JSON.stringify(cfg),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(KEY, data);
      toast.success("Auto Bet iniciado");
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Falha ao iniciar"),
  });

  const stop = useMutation({
    mutationFn: () => apiFetch<AutoBetSessionDto>("/games/autobet/stop", { method: "POST" }),
    onSuccess: (data) => {
      queryClient.setQueryData(KEY, data);
      toast.info("Auto Bet parado");
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Falha ao parar"),
  });

  return { session: session.data ?? null, start, stop };
}
