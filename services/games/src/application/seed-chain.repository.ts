/**
 * Seed resolvida para uma rodada (candidato do buffer / saída do consumo). O `Round` usa
 * `serverSeed`/`serverSeedHash`/`publicSeed`; `chainId`/`index` ficam para auditoria e
 * para o consumo atômico confirmar a posição no cursor.
 */
export interface ResolvedSeed {
  chainId: string;
  index: number;
  serverSeed: string;
  serverSeedHash: string;
  publicSeed: string;
}

/** Metadados de uma cadeia (cold storage). */
export interface SeedChainMeta {
  id: string;
  length: number;
  cursor: number;
  publicSeed: string | null;
  beaconRound: string | null;
  rootCommitment: string;
}

/** Linha de seed (para read-ahead do buffer). */
export interface SeedRow {
  index: number;
  serverSeed: string;
  serverSeedHash: string;
}

/**
 * Port da cold storage da cadeia. **Não** faz o consumo por-rodada — esse é
 * atômico junto com o insert da rodada, no {@link RoundOpener} (mesma transação, M1).
 * Aqui ficam só criação/rotação/ativação e o read-ahead do buffer.
 */
export interface SeedChainRepository {
  findActiveChain(): Promise<SeedChainMeta | null>;
  /** Cadeia pré-gerada e ainda inativa (pendente para rotação), se houver. */
  findPendingChain(): Promise<SeedChainMeta | null>;

  /**
   * Cria uma cadeia (metadados + sementes) numa transação. Nasce **inativa** e com
   * `publicSeed` nulo (resolvido na ativação, após o commit — anti-pré-computação).
   */
  createChain(params: {
    id: string;
    rootCommitment: string;
    length: number;
    beaconRound: string | null;
    seeds: SeedRow[];
  }): Promise<void>;

  /** Fixa o `publicSeed` resolvido (beacon ou fallback) antes da ativação. */
  setPublicSeed(chainId: string, publicSeed: string): Promise<void>;

  /** Desativa a cadeia antiga e ativa a nova, numa transação (`from === to` = ativar a 1ª). */
  promoteChain(fromChainId: string, toChainId: string): Promise<void>;

  /** Read-ahead para o buffer: lê seeds em `[fromIndex, fromIndex+limit)` sem consumir. */
  readSeeds(chainId: string, fromIndex: number, limit: number): Promise<SeedRow[]>;
}

export const SEED_CHAIN_REPOSITORY = Symbol("SEED_CHAIN_REPOSITORY");
