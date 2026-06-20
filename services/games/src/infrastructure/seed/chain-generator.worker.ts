import { createHash } from "node:crypto";
import { parentPort, workerData } from "node:worker_threads";

/**
 * Worker CPU-bound (B1): gera a cadeia reversa de Lamport **fora do event loop** —
 * `length` SHA-256 síncronos travariam o loop (HTTP, renovação do lease, timers) por
 * centenas de ms no boot e na rotação. Worker threads são autorizados para trabalho
 * CPU-bound (hash) — ver `docs/study/curva-compartilhada-bun-node-next.md`.
 *
 * Single-pass: devolve só `serverSeeds[]` + `rootCommitment`. Os `serverSeedHash` NÃO
 * são recomputados aqui nem no chamador — `chain[i] = sha256(chain[i+1])` significa que
 * `serverSeedHash[i+1] = chain[i]` (e `serverSeedHash[0] = rootCommitment`), então o
 * chamador os deriva com **zero** hashing extra.
 */
export interface ChainGenInput {
  baseSeed: string;
  length: number;
}

export interface ChainGenOutput {
  serverSeeds: string[];
  rootCommitment: string;
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function generate({ baseSeed, length }: ChainGenInput): ChainGenOutput {
  const serverSeeds = new Array<string>(length);
  serverSeeds[length - 1] = baseSeed; // S_N
  for (let i = length - 2; i >= 0; i--) {
    serverSeeds[i] = sha256Hex(serverSeeds[i + 1]); // S_{n-1} = sha256(S_n)
  }
  return { serverSeeds, rootCommitment: sha256Hex(serverSeeds[0]) };
}

if (parentPort) {
  const input = workerData as ChainGenInput;
  parentPort.postMessage(generate(input));
}
