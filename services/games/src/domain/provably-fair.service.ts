import { createHash, createHmac } from "node:crypto";
import type { ProvablyFairPolicy } from "./provably-fair-policy";

/**
 * ProvablyFairDomainService — math pura e **determinística** do provably fair
 * (server-only, ADR 0007). Sem I/O, sem estado mutável: `node:crypto` (sha256/hmac)
 * é dependência computacional de stdlib, como `Math` — não viola a pureza do domínio.
 *
 * Esquema (ADR 0011): **hash chain reversa + public seed (híbrido tipo bustabit)**.
 * - Commitment: `sha256(serverSeed)` é publicado ANTES da rodada; o `serverSeed` só
 *   é revelado APÓS o crash (a barreira de revelação vive no agregado `Round`).
 * - Derivação: `HMAC-SHA256(key=serverSeed, msg=publicSeed)` — o `publicSeed` é um
 *   salt externo incontestável (ex.: hash de bloco recém-minerado) que anula ataques
 *   de pré-computação da cadeia.
 *
 * O agregado `Round` apenas **consome a seed resolvida** para derivar seu crash point;
 * não conhece a estrutura da cadeia (regra de agregado).
 */

/** `1.00x` em inteiro ×100 — piso natural do multiplicador. */
const MIN_CRASH_X100 = 100n;
/** 13 hex = 52 bits de resolução; `h ∈ [0, 2^52)`, dentro do safe-integer para o resto. */
const HASH_SLICE_HEX = 13;
const RESOLUTION = 2n ** 52n;

/** Breakdown estruturado de uma verificação — alimenta o endpoint `GET /rounds/:id/verify` (Etapa 4). */
export interface ProvablyFairVerification {
  /** `sha256(serverSeed) === serverSeedHash` (o commitment não foi adulterado). */
  readonly commitmentOk: boolean;
  /** O crash point recomputado bate com o registrado na rodada. */
  readonly crashPointOk: boolean;
  /** `commitmentOk && crashPointOk`. */
  readonly isValid: boolean;
  readonly recomputedCrashPointX100: number;
  readonly recomputedServerSeedHash: string;
}

export class ProvablyFairDomainService {
  /** `sha256(seed)` em hex. Usado no commitment público e nos elos da hash chain. */
  hashSeed(seed: string): string {
    return createHash("sha256").update(seed, "utf8").digest("hex");
  }

  /**
   * Gera a **cadeia reversa de Lamport**: a partir da seed base `S_N`, deriva
   * `S_{n-1} = sha256(S_n)` até `S_0`. Retorna `[S_0, …, S_N]`, onde `S_0` é o
   * **Root Commitment** (publicado antes de qualquer rodada).
   *
   * O **consumo é reverso**: a 1ª rodada usa `S_N`, a 2ª `S_{N-1}`, … — por isso
   * `sha256(seedDaRodada)` devolve a seed da rodada **anterior** (elo verificável).
   * Não dá para "andar" a cadeia no sentido do consumo via hash (seria inverter o
   * SHA-256 = preimage): em produção a cadeia é pré-gerada e persistida (Etapa 4).
   * Aqui fica só a math, determinística e testável com `length` pequeno.
   */
  generateChain(baseSeed: string, length: number): string[] {
    if (!Number.isInteger(length) || length < 1) {
      throw new RangeError("Chain length deve ser um inteiro >= 1");
    }
    const chain = new Array<string>(length);
    chain[length - 1] = baseSeed; // S_N
    for (let i = length - 2; i >= 0; i--) {
      chain[i] = this.hashSeed(chain[i + 1]); // S_{n-1} = sha256(S_n)
    }
    return chain; // [S_0 … S_N]
  }

  /**
   * Deriva o crash point (inteiro ×100) de uma rodada. **Float-free via `bigint`**:
   *
   *   h = BigInt('0x' + HMAC_SHA256(serverSeed, publicSeed).slice(0, 13))   // 52 bits
   *   se h % instantBustDivisor === 0n → 1.00x (house edge realizada)
   *   senão crashX100 = floor( (100·2^52 − h) / (2^52 − h) )                 // bustabit ×100
   *
   * `instantBustDivisor` mapeia a **probabilidade exata** do edge (`1/divisor`). A
   * divisão de `bigint` já trunca para baixo (floor), a favor da casa. O resultado é
   * limitado por `maxCrashX100` e nunca abaixo de `1.00x` (piso natural em `h = 0`).
   */
  deriveCrashPoint(
    serverSeed: string,
    publicSeed: string,
    policy: ProvablyFairPolicy,
  ): number {
    const hmac = createHmac("sha256", serverSeed)
      .update(publicSeed, "utf8")
      .digest("hex");
    const h = BigInt(`0x${hmac.slice(0, HASH_SLICE_HEX)}`);

    // House edge: crash instantâneo em 1.00x com probabilidade 1/instantBustDivisor.
    if (h % policy.instantBustDivisor === 0n) {
      return Number(MIN_CRASH_X100);
    }

    const raw = (100n * RESOLUTION - h) / (RESOLUTION - h);
    const bounded =
      raw > policy.maxCrashX100
        ? policy.maxCrashX100
        : raw < MIN_CRASH_X100
          ? MIN_CRASH_X100
          : raw;
    return Number(bounded);
  }

  /**
   * Verificação independente de uma rodada passada: confere o commitment
   * (`sha256(serverSeed) === serverSeedHash`) **e** recomputa o crash point.
   */
  verify(input: {
    serverSeed: string;
    serverSeedHash: string;
    publicSeed: string;
    crashPointX100: number;
    policy: ProvablyFairPolicy;
  }): ProvablyFairVerification {
    const recomputedServerSeedHash = this.hashSeed(input.serverSeed);
    const commitmentOk = recomputedServerSeedHash === input.serverSeedHash;
    const recomputedCrashPointX100 = this.deriveCrashPoint(
      input.serverSeed,
      input.publicSeed,
      input.policy,
    );
    const crashPointOk = recomputedCrashPointX100 === input.crashPointX100;
    return {
      commitmentOk,
      crashPointOk,
      isValid: commitmentOk && crashPointOk,
      recomputedCrashPointX100,
      recomputedServerSeedHash,
    };
  }

  /**
   * Prova o **elo da cadeia** com a rodada anterior: `sha256(revealedSeed)` deve ser
   * igual ao commitment da rodada anterior. Garante que a seed faz parte da cadeia
   * pré-comprometida (não foi escolhida a posteriori).
   */
  verifyChainLink(revealedSeed: string, priorCommitment: string): boolean {
    return this.hashSeed(revealedSeed) === priorCommitment;
  }
}
