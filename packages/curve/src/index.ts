/**
 * Math pura da curva do crash, compartilhada entre Game (autoridade) e frontend (animação).
 * A autoridade do jogo é o `crashPointX100` resolvido pela semente (inteiro exato, provably fair).
 * Multiplicador é inteiro ×100 (`t=0 → 100 = 1.00x`); `growthRate` é parâmetro (env no server, enviado ao client).
 */

const MIN_MULTIPLIER_X100 = 100;

/** Multiplicador (×100) `elapsedMs` após o início: `floor(100·e^(gr·ms/1000))`. */
export function multiplierAt(elapsedMs: number, growthRate: number): number {
  assertGrowthRate(growthRate);
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) {
    return MIN_MULTIPLIER_X100;
  }
  const value = Math.floor(100 * Math.exp((growthRate * elapsedMs) / 1000));
  return value < MIN_MULTIPLIER_X100 ? MIN_MULTIPLIER_X100 : value;
}

/** Inversa de `multiplierAt`: ms para a curva atingir `multiplierX100` (aproximação). */
export function elapsedForMultiplier(
  multiplierX100: number,
  growthRate: number,
): number {
  assertGrowthRate(growthRate);
  if (!Number.isFinite(multiplierX100) || multiplierX100 <= MIN_MULTIPLIER_X100) {
    return 0;
  }
  return (Math.log(multiplierX100 / 100) / growthRate) * 1000;
}

function assertGrowthRate(growthRate: number): void {
  if (!Number.isFinite(growthRate) || growthRate <= 0) {
    throw new RangeError(
      `growthRate deve ser um número positivo, recebeu: ${growthRate}`,
    );
  }
}
