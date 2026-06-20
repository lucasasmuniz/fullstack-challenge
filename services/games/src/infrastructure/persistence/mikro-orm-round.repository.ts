import { Injectable } from "@nestjs/common";
import { EntityManager } from "@mikro-orm/postgresql";
import { Round, RoundStatus } from "../../domain";
import {
  RoundConcurrencyError,
  type RoundRepository,
} from "../../application/round.repository";
import { RoundEntity } from "./round.entity";

/**
 * Adapter MikroORM do {@link RoundRepository}. `save` usa **UPDATE condicional por
 * `version`** (`WHERE id = ? AND version = expected`) — 1 linha afetada = ok; 0 =
 * `RoundConcurrencyError` (fencing). Cada `save` é chamado após **uma** transição
 * (version +1), então o esperado é `version - 1`.
 */
@Injectable()
export class MikroOrmRoundRepository implements RoundRepository {
  constructor(private readonly em: EntityManager) {}

  async save(round: Round): Promise<void> {
    const s = round.snapshot();
    const affected = await this.em.fork().nativeUpdate(
      RoundEntity,
      { id: s.roundId, version: s.version - 1 },
      {
        status: s.status,
        version: s.version,
        startedAt: s.startedAt,
        crashedAt: s.crashedAt,
        settledAt: s.settledAt,
      },
    );
    if (affected !== 1) {
      throw new RoundConcurrencyError(s.roundId);
    }
  }

  async findCurrent(): Promise<Round | null> {
    const row = await this.em
      .fork()
      .findOne(
        RoundEntity,
        { status: { $in: [RoundStatus.BETTING, RoundStatus.RUNNING] } },
        { orderBy: { roundNumber: "desc" } },
      );
    return row ? toRound(row) : null;
  }

  async findById(id: string): Promise<Round | null> {
    const row = await this.em.fork().findOne(RoundEntity, { id });
    return row ? toRound(row) : null;
  }

  async findHistory(limit: number, offset: number): Promise<Round[]> {
    const rows = await this.em
      .fork()
      .find(
        RoundEntity,
        { status: { $in: [RoundStatus.CRASHED, RoundStatus.SETTLED] } },
        { orderBy: { roundNumber: "desc" }, limit, offset },
      );
    return rows.map(toRound);
  }

  async findPreviousByRoundNumber(roundNumber: number): Promise<Round | null> {
    const row = await this.em
      .fork()
      .findOne(RoundEntity, { roundNumber: roundNumber - 1 });
    return row ? toRound(row) : null;
  }
}

/** Hidrata o agregado a partir da linha, validando o `status` (fail-closed). */
function toRound(e: RoundEntity): Round {
  return Round.reconstitute({
    roundId: e.id,
    roundNumber: e.roundNumber,
    status: toRoundStatus(e.status),
    crashPointX100: e.crashPointX100,
    serverSeedHash: e.serverSeedHash,
    serverSeed: e.serverSeed,
    publicSeed: e.publicSeed,
    chainId: e.chainId,
    chainIndex: e.chainIndex,
    version: e.version,
    bettingEndsAt: e.bettingEndsAt,
    startedAt: e.startedAt,
    crashedAt: e.crashedAt,
    settledAt: e.settledAt,
  });
}

function toRoundStatus(value: string): RoundStatus {
  if ((Object.values(RoundStatus) as string[]).includes(value)) {
    return value as RoundStatus;
  }
  throw new Error(`Status de rodada inválido no banco: ${value}`);
}
