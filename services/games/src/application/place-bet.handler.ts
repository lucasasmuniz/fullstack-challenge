import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { Result, type DomainError } from "@crash-game/domain-kit";
import { Money } from "@crash-game/money";
import { IntegrationEventType } from "@crash-game/contracts";
import { ENV } from "@crash-game/nestjs-kit";
import {
  Bet,
  BetAlreadyExistsError,
  NoBettingRoundError,
  type BetLimits,
} from "../domain";
import type { GamesEnv } from "../infrastructure/config/env.schema";
import {
  ROUND_REPOSITORY,
  type RoundRepository,
} from "./round.repository";
import {
  BET_REPOSITORY,
  type BetRepository,
  type OutboxMessage,
} from "./bet.repository";
import { REALTIME_PUBLISHER, type RealtimePublisher } from "./realtime.port";
import { betPlacedPayload } from "./realtime-events";
import { RealtimeEvent } from "@crash-game/realtime-contracts";
import { GameMetrics } from "../infrastructure/observability/game-metrics";

/**
 * Coloca uma aposta na rodada corrente e dispara o débito (saga). Cria a `Bet` em
 * `PENDING_FUNDS` e grava — **na mesma transação** — a linha de outbox `DebitFunds`. O
 * `player_id` vem do `sub` do JWT (controller), nunca do body. A invariante "1 aposta/
 * jogador/rodada" é imposta pelo banco (`UNIQUE(round_id, player_id)` → `BetAlreadyExists`).
 */
@Injectable()
export class PlaceBetHandler {
  private readonly limits: BetLimits;

  constructor(
    @Inject(ROUND_REPOSITORY) private readonly rounds: RoundRepository,
    @Inject(BET_REPOSITORY) private readonly bets: BetRepository,
    @Inject(ENV) private readonly env: GamesEnv,
    @Inject(REALTIME_PUBLISHER) private readonly realtime: RealtimePublisher,
    private readonly metrics: GameMetrics,
  ) {
    this.limits = {
      min: Money.fromCents(env.BET_MIN_CENTS),
      max: Money.fromCents(env.BET_MAX_CENTS),
    };
  }

  async execute(
    playerId: string,
    username: string,
    amountCents: bigint,
    autoCashoutTargetX100: number | null,
  ): Promise<Result<Bet, DomainError>> {
    const round = await this.rounds.findCurrent();
    if (!round || !round.canAcceptBets()) {
      return Result.fail(new NoBettingRoundError());
    }

    const placed = Bet.place(
      {
        betId: randomUUID(),
        roundId: round.id,
        playerId,
        username,
        amount: Money.fromCents(amountCents),
        autoCashoutTargetX100,
      },
      this.limits,
      new Date(),
    );
    if (placed.isFail) {
      return Result.fail(placed.unwrapError());
    }
    const bet = placed.unwrap();

    const outbox: OutboxMessage = {
      id: randomUUID(),
      type: IntegrationEventType.DebitFunds,
      payload: {
        betId: bet.id,
        roundId: bet.roundId,
        playerId,
        amountCents: Number(amountCents),
      },
    };

    try {
      await this.bets.place(bet, outbox);
    } catch (err) {
      if (err instanceof BetAlreadyExistsError) {
        return Result.fail(err);
      }
      throw err;
    }
    this.realtime.emitToPublic(RealtimeEvent.BetPlaced, betPlacedPayload(bet));
    this.metrics.recordBetPlaced();
    this.metrics.recordWager(amountCents);
    return Result.ok(bet);
  }
}
