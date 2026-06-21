import { Entity, PrimaryKey, Property } from "@mikro-orm/core";

/**
 * `seed_chain` — metadados de uma cadeia de seeds pré-gerada (cold storage).
 * Há no máximo **uma** cadeia `active` por vez (índice único parcial). O `cursor` é o
 * **próximo índice a consumir**, crescente (0 → length): a cadeia é gerada hasheando
 * para baixo (`chain[i] = sha256(chain[i+1])`) e **consumida no sentido reverso**
 * (índice 0 → length−1), de modo que revelar a seed da rodada k permite verificar
 * `sha256(seed_k) == seed_{k-1}` (já revelado), sem permitir prever a rodada k+1.
 */
@Entity({ tableName: "seed_chain" })
export class SeedChainEntity {
  @PrimaryKey({ type: "uuid" })
  id!: string;

  /** `sha256(chain[0])` — comprometido antes de qualquer rodada da cadeia. */
  @Property({ type: "text" })
  rootCommitment!: string;

  @Property({ type: "integer" })
  length!: number;

  /** Próximo índice a consumir (0..length). Avança em +1 por seed consumida. */
  @Property({ type: "integer" })
  cursor!: number;

  /**
   * Salt público (entropia externa do beacon) misturado no HMAC da derivação.
   * **Nullable**: a cadeia é criada com o commitment (`beaconRound`) mas o valor só
   * é resolvido na ativação (depois do commit → anti-pré-computação). A cadeia só pode ser
   * consumida com `publicSeed` resolvido.
   */
  @Property({ type: "text", nullable: true })
  publicSeed!: string | null;

  /**
   * Rodada **futura** do beacon (drand) commitada na criação da cadeia — desconhecida no
   * momento da geração. `null` quando o beacon estava offline (fallback CSPRNG).
   */
  @Property({ type: "bigint", nullable: true })
  beaconRound!: string | null;

  /** No máx. uma cadeia ativa (índice único parcial na migration). */
  @Property({ type: "boolean" })
  active!: boolean;

  @Property({ type: "datetime" })
  createdAt: Date = new Date();
}

/**
 * `seed_chain_seed` — as sementes da cadeia, acesso O(1) por `(chain_id, index)`.
 * **PK composta `(chain_id, index)`**: sem ela, uma nova cadeia (índices 0..N de novo)
 * colidiria com a anterior na rotação; a composta deixa as cadeias coexistirem durante
 * o handoff. `server_seed_hash = sha256(server_seed)` é o commitment da rodada.
 */
@Entity({ tableName: "seed_chain_seed" })
export class SeedChainSeedEntity {
  @PrimaryKey({ type: "uuid" })
  chainId!: string;

  @PrimaryKey({ type: "integer" })
  index!: number;

  @Property({ type: "text" })
  serverSeed!: string;

  @Property({ type: "text" })
  serverSeedHash!: string;

  @Property({ type: "datetime", nullable: true })
  consumedAt!: Date | null;
}
