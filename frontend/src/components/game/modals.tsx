"use client";

import { useUiStore } from "@/stores/ui-store";
import { WalletModal } from "./wallet-modal";
import { HistoryModal } from "./history-modal";
import { LeaderboardModal } from "./leaderboard-modal";
import { VerifyModal } from "./verify-modal";
import { SettingsModal } from "./settings-modal";

/** Renderiza o modal ativo (um por vez), conforme o ui-store. Montado uma vez no shell do app. */
export function Modals() {
  const modal = useUiStore((s) => s.modal);
  if (!modal) return null;

  switch (modal.type) {
    case "deposit":
      return <WalletModal mode="deposit" />;
    case "withdraw":
      return <WalletModal mode="withdraw" />;
    case "history":
      return <HistoryModal />;
    case "leaderboard":
      return <LeaderboardModal />;
    case "settings":
      return <SettingsModal />;
    case "verify":
      return <VerifyModal roundId={modal.roundId} />;
  }
}
