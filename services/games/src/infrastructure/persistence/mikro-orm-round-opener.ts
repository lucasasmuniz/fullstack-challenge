import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { LockMode } from "@mikro-orm/core";
import { EntityManager } from "@mikro-orm/postgresql";
import { ENV } from "@crash-game/nestjs-kit";
import {
  ProvablyFairDomainService,
  Round,
  type ProvablyFairPolicy,
} from "../../domain";
import type { GamesEnv } from "../config/env.schema";
import type {
  OpenRoundResult,
  RoundOpener,
} from "../../application/round-opener";
import type { ResolvedSeed } from "../../application/seed-chain.repository";
import { SeedChainEntity, SeedChainSeedEntity } from "./seed-chain.entity";
import { RoundEntity } from "./round.entity";

interface NextvalRow {
  nextval: string;
}

/**
 * Abertura atômica da rodada (M1): consumo da seed e insert da rodada **na mesma
 * transação**. A cadeia ativa é travada (`PESSIMISTIC_WRITE`) para serializar com outras
 * aberturas; o cursor só avança se a rodada for inserida com sucesso.
 */
@Injectable()
export class MikroOrmRoundOpener implements RoundOpener {
  private readonly policy: ProvablyFairPolicy;

  constructor(
    private readonly em: EntityManager,
    private readonly provablyFair: ProvablyFairDomainService,
    @Inject(ENV) private readonly env: GamesEnv,
  ) {
    this.policy = {
      instantBustDivisor: BigInt(env.PROVABLY_FAIR_INSTANT_BUST_DIVISOR),
      maxCrashX100: BigInt(env.PROVABLY_FAIR_MAX_CRASH_X100),
    };
  }

  async open(bufferedCandidate: ResolvedSeed | null): Promise<OpenRoundResult> {
    return this.em.transactional(async (em) => {
      const chain = await em.findOne(
        SeedChainEntity,
        { active: true },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      if (!chain || chain.publicSeed === null) {
        return { kind: "noChain" };
      }
      if (chain.cursor >= chain.length) {
        return { kind: "exhausted" };
      }
      // Candidato do buffer só é aceito se casar exatamente com o cursor atual.
      if (
        bufferedCandidate &&
        (bufferedCandidate.chainId !== chain.id ||
          bufferedCandidate.index !== chain.cursor)
      ) {
        return { kind: "stale" };
      }

      const index = chain.cursor;
      const seedRow = await em.findOne(SeedChainSeedEntity, {
        chainId: chain.id,
        index,
      });
      if (!seedRow) {
        return { kind: "exhausted" };
      }

      const now = new Date();
      const roundNumber = await this.nextRoundNumber(em);
      const round = Round.open(
        {
          roundId: randomUUID(),
          roundNumber,
          serverSeed: seedRow.serverSeed,
          serverSeedHash: seedRow.serverSeedHash,
          publicSeed: chain.publicSeed,
          chainId: chain.id,
          chainIndex: index,
          bettingEndsAt: new Date(now.getTime() + this.env.BETTING_WINDOW_MS),
        },
        this.provablyFair,
        this.policy,
        now,
      );

      // Consome a seed e insere a rodada na mesma tx (atômico).
      seedRow.consumedAt = now;
      chain.cursor = index + 1;
      const s = round.snapshot();
      em.persist(
        em.create(RoundEntity, {
          id: s.roundId,
          roundNumber: s.roundNumber,
          status: s.status,
          crashPointX100: s.crashPointX100,
          serverSeedHash: s.serverSeedHash,
          serverSeed: s.serverSeed,
          publicSeed: s.publicSeed,
          chainId: s.chainId,
          chainIndex: s.chainIndex,
          version: s.version,
          bettingEndsAt: s.bettingEndsAt,
          startedAt: s.startedAt,
          crashedAt: s.crashedAt,
          settledAt: s.settledAt,
          createdAt: now,
        }),
      );

      return { kind: "opened", round };
    });
  }

  private async nextRoundNumber(em: EntityManager): Promise<number> {
    const rows = await em.execute<NextvalRow[]>(
      "select nextval('round_number_seq') as nextval",
    );
    return Number(rows[0].nextval);
  }
}
