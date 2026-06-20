import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from "@nestjs/common";
import { ENV } from "@crash-game/nestjs-kit";
import { elapsedForMultiplier } from "@crash-game/curve";
import { Round, RoundStatus } from "../domain";
import type { GamesEnv } from "../infrastructure/config/env.schema";
import {
  ROUND_REPOSITORY,
  RoundConcurrencyError,
  type RoundRepository,
} from "./round.repository";
import { ROUND_OPENER, type RoundOpener } from "./round-opener";
import { SeedBuffer } from "./seed-buffer";
import { SeedChainService } from "./seed-chain.service";
import { LeaderLease } from "./leader-lease";

const MAX_OPEN_ATTEMPTS = 4;

/**
 * `RoundScheduler` — loop autoritativo do jogo (ADR 0015). Apenas o **líder** (lease
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

  constructor(
    @Inject(ROUND_REPOSITORY) private readonly rounds: RoundRepository,
    @Inject(ROUND_OPENER) private readonly opener: RoundOpener,
    private readonly seedBuffer: SeedBuffer,
    private readonly seedChain: SeedChainService,
    private readonly lease: LeaderLease,
    @Inject(ENV) private readonly env: GamesEnv,
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

  // ---- liderança -----------------------------------------------------------

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
    this.clearRenew();
    void this.lease.release().catch(() => {
      // releaseIfOwner é seguro; ignora falha de rede no step-down.
    });
    // acquireTimer segue rodando para reassumir quando o lease estiver livre.
  }

  // ---- ciclo da rodada -----------------------------------------------------

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
        // RUNNING sem startedAt é corrupção de dados — crasha já em vez de agendar pro futuro.
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
      this.schedule(() => this.crashRound(current), crashAt - now.getTime());
      return;
    }
    if (current.status === RoundStatus.CRASHED) {
      // Crashou mas não liquidou (líder morreu entre crash e settle) — resume a liquidação.
      this.logger.log(`Recovery: rodada #${current.roundNumber} CRASHED — liquidando.`);
      await this.settleRound(current);
      return;
    }
    await this.openRound();
  }

  private async openRound(): Promise<void> {
    const round = await this.acquireRound();
    if (!round) {
      return; // acquireRound já reagendou uma nova tentativa
    }
    this.logger.log(`Rodada #${round.roundNumber} aberta (BETTING).`);
    // Manutenção de seeds (best-effort; não bloqueia o jogo).
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
          break; // re-tenta via cold
        case "exhausted":
          await this.seedChain.rotate();
          await this.seedBuffer.clear(); // candidatos da cadeia antiga ficam stale
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
    // GUARDRAIL: usa o crashPointX100 IMUTÁVEL (do open); NÃO recomputa por Date.now()
    // no disparo do timer (drift do event loop não pode inflar o crash → quebraria o
    // provably fair).
    const res = round.crash(this.now());
    if (res.isFail) {
      await this.reconcile();
      return;
    }
    await this.rounds.save(round);
    this.logger.log(
      `Rodada #${round.roundNumber} CRASHED @ ${(round.crashPointX100 / 100).toFixed(2)}x.`,
    );
    await this.settleRound(round);
  }

  private async settleRound(round: Round): Promise<void> {
    const res = round.settle(this.now());
    if (res.isFail) {
      await this.reconcile();
      return;
    }
    await this.rounds.save(round);
    this.schedule(() => this.openRound(), this.env.INTER_ROUND_DELAY_MS);
  }

  // ---- infra de timers -----------------------------------------------------

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
