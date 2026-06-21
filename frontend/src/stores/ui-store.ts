import { create } from "zustand";

export type ModalKind =
  | { type: "deposit" }
  | { type: "withdraw" }
  | { type: "history" }
  | { type: "leaderboard" }
  | { type: "settings" }
  | { type: "verify"; roundId: string };

interface UiState {
  modal: ModalKind | null;
  open: (modal: ModalKind) => void;
  close: () => void;
}

/** Estado de UI efêmero: qual modal está aberto (só um por vez). */
export const useUiStore = create<UiState>((set) => ({
  modal: null,
  open: (modal) => set({ modal }),
  close: () => set({ modal: null }),
}));
