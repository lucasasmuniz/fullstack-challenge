import { Injectable } from "@nestjs/common";
import { UniqueConstraintViolationException } from "@mikro-orm/core";
import { EntityManager } from "@mikro-orm/postgresql";
import { Money } from "@crash-game/money";
import {
  AutoBetAlreadyActiveError,
  AutoBetCompletionReason,
  AutoBetSession,
  AutoBetStatus,
  AutoBetStrategy,
} from "../../domain";
import {
  AutoBetConcurrencyError,
  type AutoBetRepository,
} from "../../application/auto-bet.repository";
import { AutoBetSessionEntity } from "./auto-bet-session.entity";

/**
 * Adapter MikroORM do {@link AutoBetRepository}. `insert` cria a sessão (constraint parcial
 * → `AutoBetAlreadyActiveError`); `save` faz UPDATE fenced por `version` (0 linhas =
 * `AutoBetConcurrencyError`).
 */
@Injectable()
export class MikroOrmAutoBetRepository implements AutoBetRepository {
  constructor(private readonly em: EntityManager) {}

  async insert(session: AutoBetSession): Promise<void> {
    const em = this.em.fork();
    try {
      em.persist(em.create(AutoBetSessionEntity, toRow(session)));
      await em.flush();
    } catch (err) {
      if (err instanceof UniqueConstraintViolationException) {
        throw new AutoBetAlreadyActiveError();
      }
      throw err;
    }
  }

  async save(session: AutoBetSession): Promise<void> {
    const affected = await this.em.fork().nativeUpdate(
      AutoBetSessionEntity,
      { id: session.id, version: session.version - 1 },
      toMutableRow(session),
    );
    if (affected !== 1) {
      throw new AutoBetConcurrencyError(session.id);
    }
  }

  async findActive(): Promise<AutoBetSession[]> {
    const rows = await this.em
      .fork()
      .find(AutoBetSessionEntity, { status: AutoBetStatus.ACTIVE });
    return rows.map(toSession);
  }

  async findActiveByPlayer(playerId: string): Promise<AutoBetSession | null> {
    const row = await this.em
      .fork()
      .findOne(AutoBetSessionEntity, { playerId, status: AutoBetStatus.ACTIVE });
    return row ? toSession(row) : null;
  }

  async findLatestByPlayer(playerId: string): Promise<AutoBetSession | null> {
    const row = await this.em
      .fork()
      .findOne(AutoBetSessionEntity, { playerId }, { orderBy: { createdAt: "desc" } });
    return row ? toSession(row) : null;
  }
}

function toRow(s: AutoBetSession): AutoBetSessionEntity {
  return {
    id: s.id,
    playerId: s.playerId,
    username: s.username,
    status: s.status,
    strategy: s.strategy,
    baseAmountCents: s.baseAmount.toCents(),
    nextAmountCents: s.nextAmount.toCents(),
    autoCashoutTargetX100: s.autoCashoutTargetX100,
    stopLossCents: s.stopLoss.toCents(),
    budgetCents: s.budget.toCents(),
    stopWinCents: s.stopWin ? s.stopWin.toCents() : null,
    maxRounds: s.maxRounds,
    roundsPlayed: s.roundsPlayed,
    netResultCents: s.netResultCents,
    totalWageredCents: s.totalWageredCents,
    currentRoundId: s.currentRoundId,
    currentBetId: s.currentBetId,
    lastProcessedRoundId: s.lastProcessedRoundId,
    completionReason: s.completionReason,
    version: s.version,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}

function toMutableRow(s: AutoBetSession): {
  status: string;
  nextAmountCents: bigint;
  roundsPlayed: number;
  netResultCents: bigint;
  totalWageredCents: bigint;
  currentRoundId: string | null;
  currentBetId: string | null;
  lastProcessedRoundId: string | null;
  completionReason: string | null;
  version: number;
  updatedAt: Date;
} {
  return {
    status: s.status,
    nextAmountCents: s.nextAmount.toCents(),
    roundsPlayed: s.roundsPlayed,
    netResultCents: s.netResultCents,
    totalWageredCents: s.totalWageredCents,
    currentRoundId: s.currentRoundId,
    currentBetId: s.currentBetId,
    lastProcessedRoundId: s.lastProcessedRoundId,
    completionReason: s.completionReason,
    version: s.version,
    updatedAt: s.updatedAt,
  };
}

function toSession(e: AutoBetSessionEntity): AutoBetSession {
  return AutoBetSession.reconstitute({
    sessionId: e.id,
    playerId: e.playerId,
    username: e.username,
    status: toStatus(e.status),
    strategy: toStrategy(e.strategy),
    baseAmount: Money.fromCents(e.baseAmountCents),
    nextAmount: Money.fromCents(e.nextAmountCents),
    autoCashoutTargetX100: e.autoCashoutTargetX100,
    stopLoss: Money.fromCents(e.stopLossCents),
    budget: Money.fromCents(e.budgetCents),
    stopWin: e.stopWinCents !== null ? Money.fromCents(e.stopWinCents) : null,
    maxRounds: e.maxRounds,
    roundsPlayed: e.roundsPlayed,
    netResultCents: e.netResultCents,
    totalWageredCents: e.totalWageredCents,
    currentRoundId: e.currentRoundId,
    currentBetId: e.currentBetId,
    lastProcessedRoundId: e.lastProcessedRoundId,
    completionReason: toReason(e.completionReason),
    version: e.version,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  });
}

function toStatus(value: string): AutoBetStatus {
  if ((Object.values(AutoBetStatus) as string[]).includes(value)) {
    return value as AutoBetStatus;
  }
  throw new Error(`Status de auto-bet inválido no banco: ${value}`);
}

function toStrategy(value: string): AutoBetStrategy {
  if ((Object.values(AutoBetStrategy) as string[]).includes(value)) {
    return value as AutoBetStrategy;
  }
  throw new Error(`Estratégia de auto-bet inválida no banco: ${value}`);
}

function toReason(value: string | null): AutoBetCompletionReason | null {
  if (value === null) {
    return null;
  }
  if ((Object.values(AutoBetCompletionReason) as string[]).includes(value)) {
    return value as AutoBetCompletionReason;
  }
  throw new Error(`Motivo de conclusão de auto-bet inválido no banco: ${value}`);
}
