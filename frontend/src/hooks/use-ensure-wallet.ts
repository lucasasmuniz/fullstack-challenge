"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiError } from "@/lib/api";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useWallet, walletKeys } from "@/hooks/use-wallet";

/**
 * Garante que todo jogador autenticado tenha carteira: se o `GET /wallets/me` retorna 404 (conta
 * recém-criada, sem carteira), dispara `POST /wallets` uma vez (idempotente — 409 se já existe) e
 * revalida o saldo. Provisionamento no cliente: usa o endpoint que já existe, sem GET com efeito
 * colateral no backend.
 */
export function useEnsureWallet() {
  const { isAuthenticated } = useCurrentUser();
  const { isError, error } = useWallet(isAuthenticated);
  const queryClient = useQueryClient();
  const tried = useRef(false);

  useEffect(() => {
    const notFound = error instanceof ApiError && error.status === 404;
    if (!isAuthenticated || !isError || !notFound || tried.current) return;
    tried.current = true;
    void apiFetch("/wallets", { method: "POST" })
      .catch(() => undefined) // 409 = já existe → ok
      .finally(() => queryClient.invalidateQueries({ queryKey: walletKeys.me }));
  }, [isAuthenticated, isError, error, queryClient]);
}
