"use client";

import { useState, useCallback } from "react";
import { toast } from "sonner";
import { apiFetch, ApiError } from "@/lib/api";

interface PlacedBetDto {
  readonly id: string;
  readonly roundId: string;
  readonly amountCents: number;
  readonly status: string;
  readonly autoCashoutTargetX100: number | null;
}

interface CashedOutBetDto {
  readonly id: string;
  readonly status: string;
  readonly cashoutMultiplierX100: number | null;
  readonly payoutCents: number | null;
}

/**
 * Ações de aposta (server-authoritative). `place` cria a aposta (PENDING_FUNDS → saga debita);
 * `cashout` saca no multiplicador do servidor (sem enviar valor). Erros viram toast com a mensagem
 * do backend (saldo insuficiente, fora da fase, etc.). `pending` desabilita o botão durante o request.
 */
export function useBetActions() {
  const [pending, setPending] = useState(false);

  const place = useCallback(
    async (amountCents: number, autoCashoutTargetX100?: number) => {
      setPending(true);
      try {
        return await apiFetch<PlacedBetDto>("/games/bet", {
          method: "POST",
          body: JSON.stringify({
            amountCents,
            ...(autoCashoutTargetX100 ? { autoCashoutTargetX100 } : {}),
          }),
        });
      } catch (e) {
        toast.error(e instanceof ApiError ? e.message : "Falha ao apostar");
        return null;
      } finally {
        setPending(false);
      }
    },
    [],
  );

  const cashout = useCallback(async () => {
    setPending(true);
    try {
      const bet = await apiFetch<CashedOutBetDto>("/games/bet/cashout", {
        method: "POST",
      });
      if (bet.payoutCents != null) {
        toast.success(`Saque confirmado: R$ ${(bet.payoutCents / 100).toFixed(2)}`);
      }
      return bet;
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Falha ao sacar");
      return null;
    } finally {
      setPending(false);
    }
  }, []);

  return { place, cashout, pending };
}
