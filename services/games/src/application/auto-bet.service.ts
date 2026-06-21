import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { Result } from "@crash-game/domain-kit";
import { Money } from "@crash-game/money";
import { ENV } from "@crash-game/nestjs-kit";
import {
  AutoBetAlreadyActiveError,
  AutoBetInvalidConfigError,
  AutoBetNotActiveError,
  AutoBetSession,
  type AutoBetStrategy,
  type BetLimits,
} from "../domain";
import type { GamesEnv } from "../infrastructure/config/env.schema";
import {
  AUTO_BET_REPOSITORY,
  AutoBetConcurrencyError,
  type AutoBetRepository,
} from "./auto-bet.repository";

/** Máx. de retries do stop sob corrida com o reconcile do líder (conflito de version). */
const STOP_MAX_ATTEMPTS = 4;

/** Config validada (borda) para iniciar uma sessão — centavos como `bigint`. */
export interface StartAutoBetInput {
  strategy: AutoBetStrategy;
  baseAmountCents: bigint;
  autoCashoutTargetX100: number;
  stopLossCents: bigint;
  budgetCents: bigint;
  stopWinCents: bigint | null;
  maxRounds: number | null;
}

/**
 * `AutoBetService` — lado REST do auto-bet (criar/parar/consultar a própria sessão). O
 * `playerId` vem sempre do `sub` do JWT (controller), nunca do body. A execução por rodada
 * é do {@link AutoBetRunner} (líder).
 */
@Injectable()
export class AutoBetService {
  private readonly limits: BetLimits;

  constructor(
    @Inject(AUTO_BET_REPOSITORY) private readonly sessions: AutoBetRepository,
    @Inject(ENV) env: GamesEnv,
  ) {
    this.limits = {
      min: Money.fromCents(env.BET_MIN_CENTS),
      max: Money.fromCents(env.BET_MAX_CENTS),
    };
  }

  async start(
    playerId: string,
    username: string,
    input: StartAutoBetInput,
  ): Promise<
    Result<AutoBetSession, AutoBetAlreadyActiveError | AutoBetInvalidConfigError>
  > {
    const existing = await this.sessions.findActiveByPlayer(playerId);
    if (existing) {
      return Result.fail(new AutoBetAlreadyActiveError());
    }
    const created = AutoBetSession.start(
      {
        sessionId: randomUUID(),
        playerId,
        username,
        strategy: input.strategy,
        baseAmount: Money.fromCents(input.baseAmountCents),
        autoCashoutTargetX100: input.autoCashoutTargetX100,
        stopLoss: Money.fromCents(input.stopLossCents),
        budget: Money.fromCents(input.budgetCents),
        stopWin: input.stopWinCents !== null ? Money.fromCents(input.stopWinCents) : null,
        maxRounds: input.maxRounds,
      },
      this.limits,
      new Date(),
    );
    if (created.isFail) {
      return Result.fail(created.unwrapError());
    }
    const session = created.unwrap();
    try {
      await this.sessions.insert(session);
    } catch (err) {
      if (err instanceof AutoBetAlreadyActiveError) {
        return Result.fail(err);
      }
      throw err;
    }
    return Result.ok(session);
  }

  async stop(playerId: string): Promise<Result<AutoBetSession, AutoBetNotActiveError>> {
    for (let attempt = 0; attempt < STOP_MAX_ATTEMPTS; attempt += 1) {
      const session = await this.sessions.findActiveByPlayer(playerId);
      if (!session) {
        return Result.fail(new AutoBetNotActiveError());
      }
      const res = session.stop(new Date());
      if (res.isFail) {
        return Result.fail(res.unwrapError());
      }
      try {
        await this.sessions.save(session);
        return Result.ok(session);
      } catch (err) {
        if (err instanceof AutoBetConcurrencyError) {
          continue;
        }
        throw err;
      }
    }
    return Result.fail(new AutoBetNotActiveError());
  }

  /** Sessão mais recente do jogador (qualquer status) — para o GET /me mostrar o resultado. */
  getLatest(playerId: string): Promise<AutoBetSession | null> {
    return this.sessions.findLatestByPlayer(playerId);
  }
}
