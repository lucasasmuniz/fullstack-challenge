"use client";

import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch, ApiError } from "@/lib/api";
import { walletKeys, type WalletDto } from "@/hooks/use-wallet";

type Op = "deposit" | "withdraw";

/**
 * Depósito/saque self-service (intra-contexto, REST). Cada submit gera um `Idempotency-Key` (UUID)
 * — retry da mesma operação é no-op no backend. Atualiza o saldo no cache do Query ao concluir.
 */
export function useWalletActions() {
  const [pending, setPending] = useState(false);
  const queryClient = useQueryClient();

  const run = useCallback(
    async (op: Op, amountCents: number) => {
      setPending(true);
      try {
        const wallet = await apiFetch<WalletDto>(`/wallets/${op}`, {
          method: "POST",
          headers: { "Idempotency-Key": crypto.randomUUID() },
          body: JSON.stringify({ amountCents }),
        });
        queryClient.setQueryData(walletKeys.me, wallet);
        toast.success(op === "deposit" ? "Depósito confirmado" : "Saque confirmado");
        return wallet;
      } catch (e) {
        toast.error(e instanceof ApiError ? e.message : "Operação falhou");
        return null;
      } finally {
        setPending(false);
      }
    },
    [queryClient],
  );

  return { pending, deposit: (c: number) => run("deposit", c), withdraw: (c: number) => run("withdraw", c) };
}
