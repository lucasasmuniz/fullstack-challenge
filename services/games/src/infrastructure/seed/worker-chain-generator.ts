import { Injectable } from "@nestjs/common";
import { Worker } from "node:worker_threads";
import type {
  ChainGenerator,
  GeneratedChain,
  GeneratedSeed,
} from "../../application/chain-generator.port";
import type {
  ChainGenInput,
  ChainGenOutput,
} from "./chain-generator.worker";

/**
 * Adapter do {@link ChainGenerator} que roda a geração (O(N) SHA-256) num **worker
 * thread** — mantém o event loop, o HTTP e a renovação do lease responsivos.
 *
 * O worker devolve só `serverSeeds[] + rootCommitment`; aqui derivamos os
 * `serverSeedHash` sem hashing extra: `serverSeedHash[i+1] = serverSeeds[i]` e
 * `serverSeedHash[0] = rootCommitment` (pois `serverSeeds[i] = sha256(serverSeeds[i+1])`).
 */
@Injectable()
export class WorkerChainGenerator implements ChainGenerator {
  generate(baseSeed: string, length: number): Promise<GeneratedChain> {
    return new Promise<GeneratedChain>((resolve, reject) => {
      const worker = new Worker(
        new URL("./chain-generator.worker.ts", import.meta.url),
        { workerData: { baseSeed, length } satisfies ChainGenInput },
      );

      worker.once("message", (out: ChainGenOutput) => {
        const seeds: GeneratedSeed[] = out.serverSeeds.map(
          (serverSeed, index) => ({
            index,
            serverSeed,
            serverSeedHash:
              index === 0 ? out.rootCommitment : out.serverSeeds[index - 1],
          }),
        );
        resolve({ rootCommitment: out.rootCommitment, seeds });
        void worker.terminate();
      });

      worker.once("error", (err: unknown) => {
        reject(err instanceof Error ? err : new Error(String(err)));
        void worker.terminate();
      });
    });
  }
}
