"use client";

import { useEffect } from "react";
import { useAuth } from "react-oidc-context";
import { useQueryClient } from "@tanstack/react-query";
import {
  RealtimeEvent,
  type BalanceUpdatedPayload,
} from "@crash-game/realtime-contracts";
import { createGameSocket } from "@/lib/socket";
import { useGameStore } from "@/stores/game-store";
import { walletKeys, type WalletDto } from "@/hooks/use-wallet";

/**
 * Conecta o socket do Game e liga os eventos WS ao store (round e bet) e ao cache do Query
 * (balance:updated → patch do saldo, sem refetch). Reconecta quando o token muda (anônimo↔logado),
 * pois a sala privada depende do `auth.token`. Cleanup desconecta no unmount.
 */
export function useGameSocket() {
  const token = useAuth().user?.access_token;
  const queryClient = useQueryClient();

  useEffect(() => {
    const store = useGameStore.getState();
    const socket = createGameSocket(token);

    socket.on("connect", () => store.setConn("connected"));
    socket.on("disconnect", () => store.setConn("reconnecting"));
    socket.io.on("reconnect_attempt", () => store.setConn("reconnecting"));
    socket.io.on("error", () => store.setConn("offline"));

    socket.on(RealtimeEvent.RoundOpened, store.onRoundOpened);
    socket.on(RealtimeEvent.RoundStarted, store.onRoundStarted);
    socket.on(RealtimeEvent.RoundTick, store.onTick);
    socket.on(RealtimeEvent.RoundCrashed, store.onCrashed);
    socket.on(RealtimeEvent.RoundSettled, store.onSettled);
    socket.on(RealtimeEvent.BetPlaced, store.onBetPlaced);
    socket.on(RealtimeEvent.BetUpdated, store.onBetUpdated);

    socket.on(RealtimeEvent.BalanceUpdated, (p: BalanceUpdatedPayload) => {
      queryClient.setQueryData<WalletDto>(walletKeys.me, (prev) =>
        prev ? { ...prev, balanceCents: p.balanceCents } : prev,
      );
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [token, queryClient]);
}
