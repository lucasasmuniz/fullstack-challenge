import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

export interface WalletDto {
  readonly id: string;
  readonly playerId: string;
  readonly balanceCents: number;
  readonly currency: string;
}

export const walletKeys = {
  me: ["wallet", "me"] as const,
};

/** Saldo do jogador (REST). O WS `balance:updated` faz patch deste cache (F3). */
export function useWallet(enabled = true) {
  return useQuery({
    queryKey: walletKeys.me,
    queryFn: () => apiFetch<WalletDto>("/wallets/me"),
    enabled,
  });
}
