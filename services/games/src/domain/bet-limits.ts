import { Money } from "@crash-game/money";

/**
 * Limites da aposta — **injetados** (config), não hardcoded no agregado. Valores reais
 * via env; o default reflete o README (mín. `1,00`, máx. `1.000,00`). Mantém
 * o domínio configurável e os testes determinísticos (forçar cenários de borda).
 */
export interface BetLimits {
  readonly min: Money;
  readonly max: Money;
}

export const DEFAULT_BET_LIMITS: BetLimits = {
  min: Money.fromCents(100),
  max: Money.fromCents(100_000),
};
