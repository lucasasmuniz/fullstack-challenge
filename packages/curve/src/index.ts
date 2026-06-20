/**
 * `@crash-game/curve` — math **pura** da curva do crash, compartilhada entre o Game
 * (autoridade) e o frontend (animação). ADR 0007 (shared kernel com guardrail): só a
 * math; nada de seed, crash point ou autoridade do jogo.
 *
 * **NÃO-AUTORITATIVA.** `Math.exp`/`Math.log` (transcendentais) **não** têm
 * determinismo bit-a-bit garantido pelo ECMA-262 — só `+ − × ÷ sqrt` são corretamente
 * arredondados. As implementações variam por libm/CPU (x64 ≠ ARM nos últimos bits da
 * mantissa) e o `floor` pode cair em inteiros diferentes na borda. Portanto esta curva
 * serve apenas para **animação / aproximação wall-clock**; pode haver drift de poucos
 * ms entre server e client. A **autoridade do jogo é unicamente o `crashPointX100`
 * resolvido pela semente** (inteiro exato, provably fair) — ver `ProvablyFairDomainService`.
 *
 * Multiplicador é inteiro ×100 (`t=0 → 100 = 1.00x`). `growthRate` é **parâmetro** (env
 * no server, enviado ao client) — não fica "assado" no pacote.
 */

/** `1.00x` em inteiro ×100 — piso da curva. */
const MIN_MULTIPLIER_X100 = 100;

/** Multiplicador (×100) `elapsedMs` após o início da rodada: `floor(100·e^(gr·ms/1000))`. */
export function multiplierAt(elapsedMs: number, growthRate: number): number {
  assertGrowthRate(growthRate);
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) {
    return MIN_MULTIPLIER_X100;
  }
  const value = Math.floor(100 * Math.exp((growthRate * elapsedMs) / 1000));
  return value < MIN_MULTIPLIER_X100 ? MIN_MULTIPLIER_X100 : value;
}

/**
 * Inversa: ms decorridos para a curva atingir `multiplierX100`. Usada pelo server para
 * agendar o crash; o resultado é **aproximação** (ver aviso de não-determinismo acima).
 */
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
