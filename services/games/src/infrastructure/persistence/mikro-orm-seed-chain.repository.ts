import { Injectable } from "@nestjs/common";
import { EntityManager } from "@mikro-orm/postgresql";
import { SeedChainEntity, SeedChainSeedEntity } from "./seed-chain.entity";
import type {
  SeedChainMeta,
  SeedChainRepository,
  SeedRow,
} from "../../application/seed-chain.repository";

const INSERT_BATCH = 5000;

/**
 * Adapter MikroORM da cold storage da cadeia (ADR 0013). O **consumo** por-rodada NÃO
 * vive aqui — é atômico com o insert da rodada no {@link MikroOrmRoundOpener}. Aqui ficam
 * criação/ativação/rotação e o read-ahead do buffer.
 */
@Injectable()
export class MikroOrmSeedChainRepository implements SeedChainRepository {
  constructor(private readonly em: EntityManager) {}

  async findActiveChain(): Promise<SeedChainMeta | null> {
    const chain = await this.em.fork().findOne(SeedChainEntity, { active: true });
    return chain ? toMeta(chain) : null;
  }

  async findPendingChain(): Promise<SeedChainMeta | null> {
    const chain = await this.em
      .fork()
      .findOne(SeedChainEntity, { active: false }, { orderBy: { createdAt: "asc" } });
    return chain ? toMeta(chain) : null;
  }

  async createChain(params: {
    id: string;
    rootCommitment: string;
    length: number;
    beaconRound: string | null;
    seeds: SeedRow[];
  }): Promise<void> {
    await this.em.transactional(async (em) => {
      await em.insert(SeedChainEntity, {
        id: params.id,
        rootCommitment: params.rootCommitment,
        length: params.length,
        cursor: 0,
        publicSeed: null,
        beaconRound: params.beaconRound,
        active: false,
        createdAt: new Date(),
      });
      for (let i = 0; i < params.seeds.length; i += INSERT_BATCH) {
        const slice = params.seeds.slice(i, i + INSERT_BATCH).map((s) => ({
          chainId: params.id,
          index: s.index,
          serverSeed: s.serverSeed,
          serverSeedHash: s.serverSeedHash,
          consumedAt: null,
        }));
        await em.insertMany(SeedChainSeedEntity, slice);
      }
    });
  }

  async setPublicSeed(chainId: string, publicSeed: string): Promise<void> {
    await this.em.fork().nativeUpdate(SeedChainEntity, { id: chainId }, { publicSeed });
  }

  async promoteChain(fromChainId: string, toChainId: string): Promise<void> {
    await this.em.transactional(async (em) => {
      const from = await em.findOne(SeedChainEntity, { id: fromChainId });
      if (from) {
        from.active = false;
      }
      // Flush o desativamento antes de ativar a nova → respeita o índice único parcial
      // (no máx. 1 ativa); senão poderia haver 2 ativas no meio do flush.
      await em.flush();
      const to = await em.findOne(SeedChainEntity, { id: toChainId });
      if (to) {
        to.active = true;
      }
    });
  }

  async readSeeds(
    chainId: string,
    fromIndex: number,
    limit: number,
  ): Promise<SeedRow[]> {
    const rows = await this.em.fork().find(
      SeedChainSeedEntity,
      { chainId, index: { $gte: fromIndex } },
      { orderBy: { index: "asc" }, limit },
    );
    return rows.map((r) => ({
      index: r.index,
      serverSeed: r.serverSeed,
      serverSeedHash: r.serverSeedHash,
    }));
  }
}

function toMeta(chain: SeedChainEntity): SeedChainMeta {
  return {
    id: chain.id,
    length: chain.length,
    cursor: chain.cursor,
    publicSeed: chain.publicSeed,
    beaconRound: chain.beaconRound,
    rootCommitment: chain.rootCommitment,
  };
}
