import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AutoBetStrategy } from "@/hooks/use-auto-bet";

interface AutoBetConfigState {
  strategy: AutoBetStrategy;
  baseCents: number;
  targetX100: number;
  stopLossCents: number;
  budgetCents: number;
  set: (patch: Partial<Omit<AutoBetConfigState, "set">>) => void;
}

/**
 * Config do auto-bet persistida no localStorage — lembra os valores entre trocas de aba e sessões
 * (em vez de resetar pro saldo). Stop-loss/orçamento abrem em 0 até o jogador definir.
 */
export const useAutoBetConfig = create<AutoBetConfigState>()(
  persist(
    (set) => ({
      strategy: "FIXED",
      baseCents: 2_000,
      targetX100: 200,
      stopLossCents: 0,
      budgetCents: 0,
      set: (patch) => set(patch),
    }),
    { name: "junglecrash-autobet" },
  ),
);
