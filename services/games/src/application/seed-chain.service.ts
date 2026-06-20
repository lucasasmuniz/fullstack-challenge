import { Inject, Injectable, Logger } from "@nestjs/common";
import { randomBytes, randomUUID } from "node:crypto";
import { ENV } from "@crash-game/nestjs-kit";
import type { GamesEnv } from "../infrastructure/config/env.schema";
import {
  SEED_CHAIN_REPOSITORY,
  type SeedChainMeta,
  type SeedChainRepository,
} from "./seed-chain.repository";
import {
  CHAIN_GENERATOR,
  type ChainGenerator,
} from "./chain-generator.port";
import {
  PUBLIC_SEED_BEACON,
  type PublicSeedBeacon,
} from "./public-seed-beacon.port";

/**
 * Gera, ativa e rotaciona a cadeia de seeds (cold storage authoritative — ADR 0013). A
 * geração (O(N) SHA-256) roda em worker thread (B1). O `publicSeed` vem de um beacon
 * externo commitado **antes** da geração e resolvido na ativação (ADR 0017); offline →
 * fallback CSPRNG. O **consumo** por-rodada NÃO mora aqui (é atômico no `RoundOpener`).
 */
@Injectable()
export class SeedChainService {
  private readonly logger = new Logger(SeedChainService.name);

  constructor(
    @Inject(SEED_CHAIN_REPOSITORY)
    private readonly repo: SeedChainRepository,
    @Inject(CHAIN_GENERATOR)
    private readonly generator: ChainGenerator,
    @Inject(PUBLIC_SEED_BEACON)
    private readonly beacon: PublicSeedBeacon,
    @Inject(ENV) private readonly env: GamesEnv,
  ) {}

  /**
   * Garante uma cadeia ativa **com `publicSeed` resolvido** (gera a primeira no boot, se
   * faltar; resolve o publicSeed se ficou pendente).
   */
  async ensureActiveChain(): Promise<void> {
    const active = await this.repo.findActiveChain();
    if (active) {
      if (active.publicSeed === null) {
        await this.resolveAndSet(active);
      }
      return;
    }
    // Sem cadeia ativa: garante uma pendente, resolve o publicSeed e ativa.
    let pending = await this.repo.findPendingChain();
    if (!pending) {
      await this.generateChain();
      pending = await this.repo.findPendingChain();
    }
    if (!pending) {
      throw new Error("Falha ao criar a cadeia de seeds inicial.");
    }
    await this.resolveAndSet(pending);
    await this.repo.promoteChain(pending.id, pending.id); // ativa a primeira
    this.logger.log(`Cadeia ${pending.id} ativada.`);
  }

  /** Rotaciona: promove a pendente (gerando/resolvendo se preciso) e desativa a ativa. */
  async rotate(): Promise<void> {
    const active = await this.repo.findActiveChain();
    let pending = await this.repo.findPendingChain();
    if (!pending) {
      await this.generateChain();
      pending = await this.repo.findPendingChain();
    }
    if (!pending) {
      throw new Error("Falha ao gerar a cadeia para rotação.");
    }
    if (pending.publicSeed === null) {
      await this.resolveAndSet(pending);
    }
    await this.repo.promoteChain(active?.id ?? pending.id, pending.id);
    this.logger.log(`Cadeia rotacionada → ${pending.id}`);
  }

  /** Pré-gera a próxima cadeia (inativa) quando a ativa se aproxima da exaustão. */
  async pregenerateIfNearExhaustion(): Promise<void> {
    const active = await this.repo.findActiveChain();
    if (!active) {
      return;
    }
    const remaining = active.length - active.cursor;
    if (remaining > this.env.SEED_CHAIN_ROTATE_THRESHOLD) {
      return;
    }
    const pending = await this.repo.findPendingChain();
    if (!pending) {
      this.logger.log(
        `Cadeia ativa perto da exaustão (restam ${remaining.toString()}) — pré-gerando a próxima.`,
      );
      await this.generateChain();
    }
  }

  /**
   * Cria uma cadeia nova (inativa): gera no worker, commita uma rodada **futura** do
   * beacon (desconhecida agora → anti-pré-computação) e persiste. O `publicSeed` é
   * resolvido depois, na ativação.
   */
  private async generateChain(): Promise<void> {
    const id = randomUUID();
    const baseSeed = randomBytes(32).toString("hex");
    const length = this.env.SEED_CHAIN_LENGTH;
    const generated = await this.generator.generate(baseSeed, length); // worker (B1)
    const beaconRound = await this.beacon.commitFutureRound(); // commit antes de revelar
    await this.repo.createChain({
      id,
      rootCommitment: generated.rootCommitment,
      length,
      beaconRound,
      seeds: generated.seeds,
    });
    this.logger.log(
      `Cadeia ${id} gerada (length=${length.toString()}, beaconRound=${beaconRound ?? "none"}).`,
    );
  }

  /** Resolve o `publicSeed` (beacon ou fallback CSPRNG) e persiste antes da ativação. */
  private async resolveAndSet(chain: SeedChainMeta): Promise<void> {
    let value: string | null = null;
    if (chain.beaconRound) {
      value = await this.beacon.resolve(chain.beaconRound);
    }
    if (!value) {
      value = randomBytes(32).toString("hex");
      this.logger.warn(
        `publicSeed via CSPRNG (beacon indisponível) na cadeia ${chain.id} — propriedade anti-pré-computação degradada nesta cadeia.`,
      );
    }
    await this.repo.setPublicSeed(chain.id, value);
  }
}
