/** Linha de seed gerada (índice + seed + commitment dela). */
export interface GeneratedSeed {
  index: number;
  serverSeed: string;
  serverSeedHash: string;
}

export interface GeneratedChain {
  rootCommitment: string;
  seeds: GeneratedSeed[];
}

/**
 * Port da geração da cadeia (CPU-bound). O adapter roda em worker thread para não
 * travar o event loop. A aplicação depende só desta interface.
 */
export interface ChainGenerator {
  generate(baseSeed: string, length: number): Promise<GeneratedChain>;
}

export const CHAIN_GENERATOR = Symbol("CHAIN_GENERATOR");
