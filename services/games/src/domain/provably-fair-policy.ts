/**
 * Política do provably fair — **injetada** (config), nunca hardcoded no cálculo.
 * Os valores reais vêm de env; aqui há um default canônico para testes
 * e documentação. Mantém o domínio configurável e os testes determinísticos.
 */
export interface ProvablyFairPolicy {
  /**
   * Mapeia a **probabilidade exata da house edge**: o crash instantâneo em `1.00x`
   * ocorre quando `h % instantBustDivisor === 0n`, ou seja, com probabilidade
   * `1 / instantBustDivisor`. Ex.: `101n` → `1/101 ≈ 0.99%` de vantagem da casa.
   * É a blindagem matemática do house edge — trocar o divisor muda o edge de forma
   * exata e auditável.
   */
  readonly instantBustDivisor: bigint;
  /**
   * Teto do multiplicador (×100). A cauda da fórmula tende ao infinito conforme `h`
   * se aproxima da resolução; o cap evita payouts absurdos e mantém o resultado em
   * faixa segura para `Number`.
   */
  readonly maxCrashX100: bigint;
}

/**
 * Default canônico (≈1% de house edge, teto de 10.000,00x). sobrescreve
 * via env (`PROVABLY_FAIR_*`). Exposto para testes e para o endpoint de verificação.
 */
export const DEFAULT_PROVABLY_FAIR_POLICY: ProvablyFairPolicy = {
  instantBustDivisor: 101n,
  maxCrashX100: 1_000_000n,
};
