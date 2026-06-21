import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from "@nestjs/common";
import { ENV } from "@crash-game/nestjs-kit";
import { elapsedForMultiplier, multiplierAt } from "@crash-game/curve";
import { RealtimeEvent } from "@crash-game/realtime-contracts";
import { Round, RoundStatus } from "../domain";
import type { GamesEnv } from "../infrastructure/config/env.schema";
import {
  ROUND_REPOSITORY,
  RoundConcurrencyError,
  type RoundRepository,
} from "./round.repository";
import { BET_REPOSITORY, type BetRepository } from "./bet.repository";
import { AutoCashoutService } from "./auto-cashout.service";
import { AutoBetRunner } from "./auto-bet-runner";
import { GameMetrics } from "../infrastructure/observability/game-metrics";
import { ROUND_OPENER, type RoundOpener } from "./round-opener";
import { SeedBuffer } from "./seed-buffer";
import { SeedChainService } from "./seed-chain.service";
import { LeaderLease } from "./leader-lease";
import { REALTIME_PUBLISHER, type RealtimePublisher } from "./realtime.port";
import {
  roundCrashedPayload,
  roundOpenedPayload,
  roundSettledPayload,
  roundStartedPayload,
  roundTickPayload,
} from "./realtime-events";

const MAX_OPEN_ATTEMPTS = 4;

/**
 * `RoundScheduler` — loop autoritativo do jogo. Apenas o **líder** (lease
 * Valkey) roda o ciclo `BETTING → RUNNING → CRASHED → SETTLED`. A abertura é **atômica**
 * (consumo de seed + insert da rodada, via {@link RoundOpener}). O crash é agendado
 * analiticamente, mas a transição usa o `crashPointX100` **imutável** (guardrail do drift).
 * A correção sob concorrência vem do fencing por `Round.version` (líder obsoleto →
 * `RoundConcurrencyError` → step-down).
 */
@Injectable()
export class RoundScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(RoundScheduler.name);

  private isLeader = false;
  private phaseTimer: ReturnType<typeof setTimeout> | null = null;
  private renewTimer: ReturnType<typeof setInterval> | null = null;
  private acquireTimer: ReturnType<typeof setInterval> | null = null;
  private tickTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    @Inject(ROUND_REPOSITORY) private readonly rounds: RoundRepository,
    @Inject(BET_REPOSITORY) private readonly bets: BetRepository,
    @Inject(ROUND_OPENER) private readonly opener: RoundOpener,
    private readonly seedBuffer: SeedBuffer,
    private readonly seedChain: SeedChainService,
    private readonly lease: LeaderLease,
    @Inject(ENV) private readonly env: GamesEnv,
    @Inject(REALTIME_PUBLISHER) private readonly realtime: RealtimePublisher,
    private readonly autoCashout: AutoCashoutService,
    private readonly autoBet: AutoBetRunner,
    private readonly metrics: GameMetrics,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.env.SCHEDULER_ENABLED) {
      this.logger.log("SCHEDULER_ENABLED=false — engine desligado nesta instância.");
      return;
    }
    const interval = Math.max(1000, Math.floor(this.env.SCHEDULER_LEASE_TTL_MS / 2));
    this.acquireTimer = setInterval(() => {
      void this.tryAcquire();
    }, interval);
    void this.tryAcquire();
  }

  async onModuleDestroy(): Promise<void> {
    this.isLeader = false;
    this.clearPhaseTimer();
    this.clearTicks();
    this.clearRenew();
    if (this.acquireTimer !== null) {
      clearInterval(this.acquireTimer);
      this.acquireTimer = null;
    }
    try {
      await this.lease.release();
    } catch {
      // shutdown best-effort
    }
  }

  private async tryAcquire(): Promise<void> {
    if (this.isLeader) {
      return;
    }
    try {
      if (await this.lease.acquire()) {
        await this.becomeLeader();
      }
    } catch (err) {
      this.logger.warn(`Falha ao adquirir o lease: ${asMessage(err)}`);
    }
  }

  private async becomeLeader(): Promise<void> {
    this.isLeader = true;
    this.logger.log("Liderança adquirida — iniciando o scheduler.");
    this.startRenew();
    try {
      await this.seedChain.ensureActiveChain();
    } catch (err) {
      this.logger.error(`Falha ao garantir a cadeia de seeds: ${asMessage(err)}`);
    }
    await this.guard(() => this.reconcile());
  }

  private startRenew(): void {
    this.clearRenew();
    const interval = Math.max(1000, Math.floor(this.env.SCHEDULER_LEASE_TTL_MS / 3));
    this.renewTimer = setInterval(() => {
      void this.renew();
    }, interval);
  }

  private async renew(): Promise<void> {
    if (!this.isLeader) {
      return;
    }
    try {
      if (!(await this.lease.renew())) {
        this.logger.warn("Renovação do lease falhou (não-dono) — step-down.");
        this.stepDown();
      }
    } catch (err) {
      this.logger.warn(`Erro ao renovar o lease — step-down: ${asMessage(err)}`);
      this.stepDown();
    }
  }

  /**
   * Higiene: para o trabalho local e **solta o lease** (best-effort) para reassumir já,
   * sem esperar o TTL expirar. A correção em si já vem do fencing por `version`.
   */
  private stepDown(): void {
    this.isLeader = false;
    this.clearPhaseTimer();
    this.clearTicks();
    this.clearRenew();
    void this.lease.release().catch(() => {
      // releaseIfOwner é seguro; ignora falha de rede no step-down
    });
  }

  /** Recovery/continuação: retoma uma rodada presa (timer perdido) ou abre uma nova. */
  private async reconcile(): Promise<void> {
    const current = await this.rounds.findCurrent();
    if (!current) {
      await this.openRound();
      return;
    }
    const now = this.now();
    if (current.status === RoundStatus.BETTING) {
      const delay = current.bettingEndsAt.getTime() - now.getTime();
      this.logger.log(`Recovery: rodada #${current.roundNumber} em BETTING — retomando.`);
      this.schedule(() => this.startRound(current), delay);
      return;
    }
    if (current.status === RoundStatus.RUNNING) {
      if (!current.startedAt) {
        this.logger.error(
          `Rodada #${current.roundNumber} em RUNNING sem startedAt — crash imediato.`,
        );
        this.schedule(() => this.crashRound(current), 0);
        return;
      }
      const crashAt =
        current.startedAt.getTime() +
        elapsedForMultiplier(current.crashPointX100, this.env.CRASH_GROWTH_RATE);
      this.logger.log(`Recovery: rodada #${current.roundNumber} em RUNNING — retomando.`);
      this.startTicks(current.id, current.startedAt, current.crashPointX100);
      this.schedule(() => this.crashRound(current), crashAt - now.getTime());
      return;
    }
    if (current.status === RoundStatus.CRASHED) {
      this.logger.log(`Recovery: rodada #${current.roundNumber} CRASHED — liquidando.`);
      await this.settleRound(current);
      return;
    }
    await this.openRound();
  }

  private async openRound(): Promise<void> {
    const round = await this.acquireRound();
    if (!round) {
      return;
    }
    this.logger.log(`Rodada #${round.roundNumber} aberta (BETTING).`);
    this.realtime.emitToPublic(RealtimeEvent.RoundOpened, roundOpenedPayload(round));
    try {
      await this.autoBet.placeBets(round.id);
    } catch (err) {
      this.logger.warn(`Auto-bet placeBets falhou: ${asMessage(err)}`);
    }
    await this.seedBuffer.refillIfLow();
    await this.seedChain.pregenerateIfNearExhaustion();
    const delay = round.bettingEndsAt.getTime() - this.now().getTime();
    this.schedule(() => this.startRound(round), delay);
  }

  /**
   * Abre a rodada via opener atômico, tratando os desfechos: candidato stale → cold;
   * cadeia esgotada → rotaciona + limpa buffer; sem cadeia → garante. `null` se desistiu
   * (reagenda).
   */
  private async acquireRound(): Promise<Round | null> {
    for (let attempt = 0; attempt < MAX_OPEN_ATTEMPTS; attempt++) {
      const candidate =
        attempt === 0 ? await this.seedBuffer.takeCandidate() : null;
      const result = await this.opener.open(candidate);
      switch (result.kind) {
        case "opened":
          return result.round;
        case "stale":
          break;
        case "exhausted":
          await this.seedChain.rotate();
          await this.seedBuffer.clear();
          break;
        case "noChain":
          await this.seedChain.ensureActiveChain();
          break;
      }
    }
    this.logger.warn("Não consegui abrir rodada após várias tentativas — reagendando.");
    this.schedule(() => this.openRound(), this.env.INTER_ROUND_DELAY_MS);
    return null;
  }

  private async startRound(round: Round): Promise<void> {
    const res = round.start(this.now());
    if (res.isFail) {
      await this.reconcile();
      return;
    }
    await this.rounds.save(round);
    const startedAt = round.startedAt ?? this.now();
    this.realtime.emitToPublic(
      RealtimeEvent.RoundStarted,
      roundStartedPayload(round, startedAt, this.env.CRASH_GROWTH_RATE),
    );
    this.startTicks(round.id, startedAt, round.crashPointX100);
    const crashDelay = elapsedForMultiplier(
      round.crashPointX100,
      this.env.CRASH_GROWTH_RATE,
    );
    this.logger.log(
      `Rodada #${round.roundNumber} RUNNING (crash em ~${Math.round(crashDelay).toString()}ms).`,
    );
    this.schedule(() => this.crashRound(round), crashDelay);
  }

  private async crashRound(round: Round): Promise<void> {
    this.clearTicks();
    const res = round.crash(this.now());
    if (res.isFail) {
      await this.reconcile();
      return;
    }
    await this.rounds.save(round);
    this.realtime.emitToPublic(RealtimeEvent.RoundCrashed, roundCrashedPayload(round));
    this.metrics.recordRound(round.crashPointX100);
    this.logger.log(
      `Rodada #${round.roundNumber} CRASHED @ ${(round.crashPointX100 / 100).toFixed(2)}x.`,
    );
    await this.settleRound(round);
  }

  private async settleRound(round: Round): Promise<void> {
    const lost = await this.bets.markRoundLost(round.id);
    if (lost > 0) {
      this.logger.log(`Rodada #${round.roundNumber}: ${lost} aposta(s) liquidada(s) (LOST).`);
    }
    try {
      await this.autoBet.reconcile(round.id);
    } catch (err) {
      this.logger.warn(`Auto-bet reconcile falhou: ${asMessage(err)}`);
    }
    const res = round.settle(this.now());
    if (res.isFail) {
      await this.reconcile();
      return;
    }
    await this.rounds.save(round);
    this.realtime.emitToPublic(RealtimeEvent.RoundSettled, roundSettledPayload(round));
    this.schedule(() => this.openRound(), this.env.INTER_ROUND_DELAY_MS);
  }

  /**
   * Liga os ticks de resync: a cada `TICK_INTERVAL_MS`, emite `round:tick` com o
   * **`elapsedMs` autoritativo** (tempo desde `startedAt`) + `multiplierX100` (conveniência —
   * Dead Reckoning). Leader-only; parado no crash/step-down/shutdown.
   */
  private startTicks(
    roundId: string,
    startedAt: Date,
    crashPointX100: number,
  ): void {
    this.clearTicks();
    this.tickTimer = setInterval(() => {
      if (!this.isLeader) {
        return;
      }
      const now = this.now();
      const elapsedMs = now.getTime() - startedAt.getTime();
      const multiplierX100 = multiplierAt(elapsedMs, this.env.CRASH_GROWTH_RATE);
      this.realtime.emitToPublic(
        RealtimeEvent.RoundTick,
        roundTickPayload(roundId, elapsedMs, multiplierX100),
      );
      void this.autoCashout
        .sweep(roundId, crashPointX100, multiplierX100, now)
        .catch((err: unknown) => {
          this.logger.warn(`Auto-cashout sweep falhou: ${asMessage(err)}`);
        });
    }, this.env.TICK_INTERVAL_MS);
  }

  private clearTicks(): void {
    if (this.tickTimer !== null) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
  }

  private schedule(fn: () => Promise<void>, delayMs: number): void {
    this.clearPhaseTimer();
    this.phaseTimer = setTimeout(
      () => {
        void this.guard(fn);
      },
      Math.max(0, delayMs),
    );
  }

  /** Executa um passo se ainda formos líder; trata fencing (step-down) e erros (recovery). */
  private async guard(fn: () => Promise<void>): Promise<void> {
    if (!this.isLeader) {
      return;
    }
    try {
      await fn();
    } catch (err) {
      if (err instanceof RoundConcurrencyError) {
        this.logger.warn("Fencing por version — perdi a liderança; step-down.");
        this.stepDown();
        return;
      }
      this.logger.error(`Erro no scheduler (recovery agendado): ${asMessage(err)}`);
      this.schedule(() => this.reconcile(), this.env.INTER_ROUND_DELAY_MS);
    }
  }

  private clearPhaseTimer(): void {
    if (this.phaseTimer !== null) {
      clearTimeout(this.phaseTimer);
      this.phaseTimer = null;
    }
  }

  private clearRenew(): void {
    if (this.renewTimer !== null) {
      clearInterval(this.renewTimer);
      this.renewTimer = null;
    }
  }

  private now(): Date {
    return new Date();
  }
}

function asMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
