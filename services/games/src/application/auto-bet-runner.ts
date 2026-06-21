import { Inject, Injectable, Logger } from "@nestjs/common";
import { Money } from "@crash-game/money";
import { ENV } from "@crash-game/nestjs-kit";
import {
  AutoBetOutcome,
  type AutoBetSession,
  BetStatus,
  type BetLimits,
} from "../domain";
import type { GamesEnv } from "../infrastructure/config/env.schema";
import {
  AUTO_BET_REPOSITORY,
  AutoBetConcurrencyError,
  type AutoBetRepository,
} from "./auto-bet.repository";
import { BET_REPOSITORY, type BetRepository } from "./bet.repository";
import { PlaceBetHandler } from "./place-bet.handler";

/**
 * `AutoBetRunner` — orquestra as sessões de auto-bet **leader-only** (chamado pelo
 * `RoundScheduler`): no `openRound` decide+coloca a aposta de cada sessão `ACTIVE`; no
 * `settleRound` reconcilia o desfecho. Despacho **sequencial** (sem contenção). Tolera
 * `AutoBetConcurrencyError` por sessão (REST-stop venceu a corrida) sem abortar as demais.
 */
@Injectable()
export class AutoBetRunner {
  private readonly logger = new Logger(AutoBetRunner.name);
  private readonly limits: BetLimits;

  constructor(
    @Inject(AUTO_BET_REPOSITORY) private readonly sessions: AutoBetRepository,
    @Inject(BET_REPOSITORY) private readonly bets: BetRepository,
    private readonly placeBet: PlaceBetHandler,
    @Inject(ENV) env: GamesEnv,
  ) {
    this.limits = {
      min: Money.fromCents(env.BET_MIN_CENTS),
      max: Money.fromCents(env.BET_MAX_CENTS),
    };
  }

  /**
   * `openRound`: coloca (ou encerra) a aposta de cada sessão ativa para a nova rodada.
   *
   * Seguro de re-executar para o mesmo `roundId` (MINOR-2 da revisão): o par
   * `session.currentRoundId` + `bet.round_id` é a fonte única da verdade, e
   * `UNIQUE(round_id, player_id)` rejeita uma 2ª aposta do mesmo jogador na mesma rodada
   * (`BetAlreadyExistsError` → `placeForSession` apenas pula, sem mutar a sessão).
   */
  async placeBets(roundId: string): Promise<void> {
    const sessions = await this.sessions.findActive();
    for (const session of sessions) {
      await this.placeForSession(session, roundId);
    }
  }

  private async placeForSession(
    session: AutoBetSession,
    roundId: string,
  ): Promise<void> {
    const decision = session.decideStake(this.limits);
    if (decision.kind === "inactive") {
      return;
    }
    if (decision.kind === "complete") {
      session.complete(decision.reason, new Date());
      await this.persist(session);
      this.logger.log(
        `Auto-bet sessão ${session.id} encerrada antes de apostar (${decision.reason}).`,
      );
      return;
    }
    const placed = await this.placeBet.execute(
      session.playerId,
      session.username,
      decision.amount.toCents(),
      session.autoCashoutTargetX100,
    );
    if (placed.isFail) {
      this.logger.debug(
        `Auto-bet sessão ${session.id}: aposta não colocada (${placed.unwrapError().code}).`,
      );
      return;
    }
    session.commitPlaced(roundId, placed.unwrap().id, new Date());
    await this.persist(session);
  }

  /** `settleRound` (após `markRoundLost`): reconcilia o desfecho da aposta de cada sessão. */
  async reconcile(roundId: string): Promise<void> {
    const sessions = await this.sessions.findActive();
    for (const session of sessions) {
      if (session.lastProcessedRoundId === roundId) {
        continue;
      }
      if (session.currentRoundId !== roundId) {
        continue;
      }
      await this.reconcileSession(session, roundId);
    }
  }

  private async reconcileSession(
    session: AutoBetSession,
    roundId: string,
  ): Promise<void> {
    const betId = session.currentBetId;
    const bet = betId ? await this.bets.findById(betId) : null;

    let outcome: AutoBetOutcome;
    let amountCents = 0n;
    let payoutCents = 0n;
    if (!bet) {
      outcome = AutoBetOutcome.SKIPPED;
    } else {
      amountCents = bet.amount.toCents();
      switch (bet.status) {
        case BetStatus.CASHED_OUT:
          outcome = AutoBetOutcome.WIN;
          payoutCents = bet.payout ? bet.payout.toCents() : 0n;
          break;
        case BetStatus.LOST:
          outcome = AutoBetOutcome.LOSS;
          break;
        case BetStatus.REJECTED:
          outcome = AutoBetOutcome.REJECTED;
          break;
        case BetStatus.CONFIRMED:
          this.logger.warn(
            `Auto-bet sessão ${session.id}: aposta ${betId ?? "?"} ainda CONFIRMED no reconcile da rodada ${roundId} — tratando como SKIPPED.`,
          );
          outcome = AutoBetOutcome.SKIPPED;
          break;
        default:
          outcome = AutoBetOutcome.SKIPPED;
      }
    }
    session.reconcile(roundId, outcome, amountCents, payoutCents, new Date());
    await this.persist(session);
  }

  private async persist(session: AutoBetSession): Promise<void> {
    try {
      await this.sessions.save(session);
    } catch (err) {
      if (err instanceof AutoBetConcurrencyError) {
        this.logger.warn(
          `Auto-bet sessão ${session.id}: conflito de version (parada manual?) — pulando.`,
        );
        return;
      }
      throw err;
    }
  }
}
