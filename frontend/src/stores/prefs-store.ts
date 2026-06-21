import { create } from "zustand";
import { persist } from "zustand/middleware";

interface PrefsState {
  soundMaster: boolean;
  soundBet: boolean;
  soundCashout: boolean;
  soundCrash: boolean;
  showFormula: boolean;
  toggle: (key: keyof Omit<PrefsState, "toggle">) => void;
}

/** Preferências do jogador, persistidas no localStorage. Consumidas pelos efeitos sonoros (F7). */
export const usePrefsStore = create<PrefsState>()(
  persist(
    (set) => ({
      soundMaster: true,
      soundBet: true,
      soundCashout: true,
      soundCrash: true,
      showFormula: false,
      toggle: (key) => set((s) => ({ [key]: !s[key] }) as Partial<PrefsState>),
    }),
    { name: "junglecrash-prefs" },
  ),
);
