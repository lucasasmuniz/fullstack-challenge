import { AggregateRoot, Result } from "@crash-game/domain-kit";
import { Money } from "@crash-game/money";
import type { BetLimits } from "./bet-limits";
import { AutoBetStatus } from "./auto-bet-status";
import {
  AutoBetCompletionReason,
  AutoBetOutcome,
  AutoBetStrategy,
} from "./auto-bet-types";
import { AutoBetInvalidConfigError, AutoBetNotActiveError } from "./auto-bet-errors";

const MIN_MULTIPLIER_X100 = 100;

/** Estado completo da sessão — construtor privado garante inicialização total (sem `!`). */
export interface AutoBetSessionState {
  sessionId: string;
  playerId: string;
  username: string;
  status: AutoBetStatus;
  strategy: AutoBetStrategy;
  baseAmount: Money;
  nextAmount: Money;
  autoCashoutTargetX100: number;
  stopLoss: Money;
  budget: Money;
  stopWin: Money | null;
  maxRounds: number | null;
  roundsPlayed: number;
  netResultCents: bigint;
  totalWageredCents: bigint;
  currentRoundId: string | null;
  currentBetId: string | null;
  lastProcessedRoundId: string | null;
  completionReason: AutoBetCompletionReason | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

/** Decisão pura de quanto apostar no próximo round (ou encerrar antes de apostar). */
export type AutoBetStakeDecision =
  | { kind: "stake"; amount: Money }
  | { kind: "complete"; reason: AutoBetCompletionReason }
  | { kind: "inactive" };

/**
 * `AutoBetSession` — **Process Manager** server-side da aposta automática. Roda
 * sem supervisão (resiliente a aba fechada), dirigido pelo **líder** (`RoundScheduler`):
 * a cada `openRound` decide e coloca a aposta; a cada `settleRound` reconcilia o desfecho.
 *
 * Freios server-side (a sessão é autônoma, então precisa de travas duras): **stop-loss
 * obrigatório**, budget (teto de exposição acumulada), stop-win/max-rounds opcionais, teto
 * por aposta (limites do `Bet`) e **saldo insuficiente** (débito `REJECTED`).
 *
 * Dois invariantes de integridade (ver `AutoBetOutcome`):
 * 1. **SKIPPED_ROUND:** aposta não-`CONFIRMED` (latência de SQS) nunca vira perda de Martingale.
 * 2. **Idempotência:** `reconcile` é guardado por `lastProcessedRoundId` (settlement reexecutado
 *    por failover de líder não dobra o Martingale duas vezes — Idempotent Receiver).
 *
 * Concorrência: `version` (otimista) protege a corrida REST-stop × reconcile-do-líder.
 */
export class AutoBetSession extends AggregateRoot<string> {
  private _playerId: string;
  private _username: string;
  private _status: AutoBetStatus;
  private _strategy: AutoBetStrategy;
  private _baseAmount: Money;
  private _nextAmount: Money;
  private _autoCashoutTargetX100: number;
  private _stopLoss: Money;
  private _budget: Money;
  private _stopWin: Money | null;
  private _maxRounds: number | null;
  private _roundsPlayed: number;
  private _netResultCents: bigint;
  private _totalWageredCents: bigint;
  private _currentRoundId: string | null;
  private _currentBetId: string | null;
  private _lastProcessedRoundId: string | null;
  private _completionReason: AutoBetCompletionReason | null;
  private _version: number;
  private _createdAt: Date;
  private _updatedAt: Date;

  private constructor(state: AutoBetSessionState) {
    super(state.sessionId);
    this._playerId = state.playerId;
    this._username = state.username;
    this._status = state.status;
    this._strategy = state.strategy;
    this._baseAmount = state.baseAmount;
    this._nextAmount = state.nextAmount;
    this._autoCashoutTargetX100 = state.autoCashoutTargetX100;
    this._stopLoss = state.stopLoss;
    this._budget = state.budget;
    this._stopWin = state.stopWin;
    this._maxRounds = state.maxRounds;
    this._roundsPlayed = state.roundsPlayed;
    this._netResultCents = state.netResultCents;
    this._totalWageredCents = state.totalWageredCents;
    this._currentRoundId = state.currentRoundId;
    this._currentBetId = state.currentBetId;
    this._lastProcessedRoundId = state.lastProcessedRoundId;
    this._completionReason = state.completionReason;
    this._version = state.version;
    this._createdAt = state.createdAt;
    this._updatedAt = state.updatedAt;
  }

  get playerId(): string {
    return this._playerId;
  }
  get username(): string {
    return this._username;
  }
  get status(): AutoBetStatus {
    return this._status;
  }
  get strategy(): AutoBetStrategy {
    return this._strategy;
  }
  get baseAmount(): Money {
    return this._baseAmount;
  }
  get nextAmount(): Money {
    return this._nextAmount;
  }
  get autoCashoutTargetX100(): number {
    return this._autoCashoutTargetX100;
  }
  get stopLoss(): Money {
    return this._stopLoss;
  }
  get budget(): Money {
    return this._budget;
  }
  get stopWin(): Money | null {
    return this._stopWin;
  }
  get maxRounds(): number | null {
    return this._maxRounds;
  }
  get roundsPlayed(): number {
    return this._roundsPlayed;
  }
  get netResultCents(): bigint {
    return this._netResultCents;
  }
  get totalWageredCents(): bigint {
    return this._totalWageredCents;
  }
  get currentRoundId(): string | null {
    return this._currentRoundId;
  }
  get currentBetId(): string | null {
    return this._currentBetId;
  }
  get lastProcessedRoundId(): string | null {
    return this._lastProcessedRoundId;
  }
  get completionReason(): AutoBetCompletionReason | null {
    return this._completionReason;
  }
  get version(): number {
    return this._version;
  }
  get createdAt(): Date {
    return this._createdAt;
  }
  get updatedAt(): Date {
    return this._updatedAt;
  }

  /**
   * Inicia uma sessão `ACTIVE`. Valida a config (defesa em profundidade — a borda também
   * valida via zod). **stop-loss e budget obrigatórios**; auto-cashout-alvo obrigatório
   * (sem alvo, toda aposta correria até o crash e perderia — auto-bet não faria sentido).
   */
  static start(
    props: {
      sessionId: string;
      playerId: string;
      username: string;
      strategy: AutoBetStrategy;
      baseAmount: Money;
      autoCashoutTargetX100: number;
      stopLoss: Money;
      budget: Money;
      stopWin: Money | null;
      maxRounds: number | null;
    },
    limits: BetLimits,
    now: Date,
  ): Result<AutoBetSession, AutoBetInvalidConfigError> {
    if (
      props.baseAmount.isLessThan(limits.min) ||
      limits.max.isLessThan(props.baseAmount)
    ) {
      return Result.fail(
        new AutoBetInvalidConfigError("valor base fora dos limites da aposta"),
      );
    }
    if (
      !Number.isInteger(props.autoCashoutTargetX100) ||
      props.autoCashoutTargetX100 <= MIN_MULTIPLIER_X100
    ) {
      return Result.fail(
        new AutoBetInvalidConfigError("alvo de auto-cashout deve ser inteiro > 1.00x"),
      );
    }
    if (props.stopLoss.toCents() <= 0n) {
      return Result.fail(new AutoBetInvalidConfigError("stop-loss deve ser > 0"));
    }
    if (props.budget.isLessThan(props.baseAmount)) {
      return Result.fail(
        new AutoBetInvalidConfigError("budget deve cobrir ao menos uma aposta base"),
      );
    }
    if (props.stopWin !== null && props.stopWin.toCents() <= 0n) {
      return Result.fail(new AutoBetInvalidConfigError("stop-win deve ser > 0"));
    }
    if (
      props.maxRounds !== null &&
      (!Number.isInteger(props.maxRounds) || props.maxRounds < 1)
    ) {
      return Result.fail(
        new AutoBetInvalidConfigError("max-rounds deve ser inteiro >= 1"),
      );
    }

    return Result.ok(
      new AutoBetSession({
        sessionId: props.sessionId,
        playerId: props.playerId,
        username: props.username,
        status: AutoBetStatus.ACTIVE,
        strategy: props.strategy,
        baseAmount: props.baseAmount,
        nextAmount: props.baseAmount,
        autoCashoutTargetX100: props.autoCashoutTargetX100,
        stopLoss: props.stopLoss,
        budget: props.budget,
        stopWin: props.stopWin,
        maxRounds: props.maxRounds,
        roundsPlayed: 0,
        netResultCents: 0n,
        totalWageredCents: 0n,
        currentRoundId: null,
        currentBetId: null,
        lastProcessedRoundId: null,
        completionReason: null,
        version: 1,
        createdAt: now,
        updatedAt: now,
      }),
    );
  }

  /**
   * Decisão **pura** (sem mutação) de quanto apostar no próximo round, ou encerrar antes de
   * apostar quando o próximo valor estoura o teto por aposta ou o budget acumulado.
   */
  decideStake(limits: BetLimits): AutoBetStakeDecision {
    if (this._status !== AutoBetStatus.ACTIVE) {
      return { kind: "inactive" };
    }
    if (limits.max.isLessThan(this._nextAmount)) {
      return { kind: "complete", reason: AutoBetCompletionReason.MAX_BET_EXCEEDED };
    }
    const wouldWager = this._totalWageredCents + this._nextAmount.toCents();
    if (wouldWager > this._budget.toCents()) {
      return { kind: "complete", reason: AutoBetCompletionReason.BUDGET_EXCEEDED };
    }
    return { kind: "stake", amount: this._nextAmount };
  }

  /** Encerra a sessão (freio atingido). Idempotente em terminais (apenas atualiza updatedAt). */
  complete(reason: AutoBetCompletionReason, now: Date): void {
    this.completeInternal(reason);
    this._version += 1;
    this._updatedAt = now;
  }

  /** Registra a aposta colocada para `roundId` (após o `place` bem-sucedido). */
  commitPlaced(roundId: string, betId: string, now: Date): void {
    this._currentRoundId = roundId;
    this._currentBetId = betId;
    this._version += 1;
    this._updatedAt = now;
  }

  /**
   * Reconcilia o desfecho do round (chamado no settlement, líder-only). **Idempotente**
   * (`lastProcessedRoundId`) e correlacionado (`currentRoundId`). Aplica a máquina de 3 vias
   * + REJECTED e os freios pós-round. Um único `version += 1` por chamada (fencing limpo).
   */
  reconcile(
    roundId: string,
    outcome: AutoBetOutcome,
    betAmountCents: bigint,
    payoutCents: bigint,
    now: Date,
  ): void {
    if (this._lastProcessedRoundId === roundId) {
      return;
    }
    if (this._currentRoundId !== roundId) {
      return;
    }
    this._lastProcessedRoundId = roundId;
    this._currentRoundId = null;
    this._currentBetId = null;

    switch (outcome) {
      case AutoBetOutcome.WIN:
        this._netResultCents += payoutCents - betAmountCents;
        this._totalWageredCents += betAmountCents;
        this._roundsPlayed += 1;
        this._nextAmount = this._baseAmount;
        break;
      case AutoBetOutcome.LOSS:
        this._netResultCents -= betAmountCents;
        this._totalWageredCents += betAmountCents;
        this._roundsPlayed += 1;
        if (this._strategy === AutoBetStrategy.MARTINGALE) {
          this._nextAmount = Money.fromCents(this._nextAmount.toCents() * 2n);
        }
        break;
      case AutoBetOutcome.SKIPPED:
        break;
      case AutoBetOutcome.REJECTED:
        this.completeInternal(AutoBetCompletionReason.INSUFFICIENT_FUNDS);
        break;
    }

    if (
      this._status === AutoBetStatus.ACTIVE &&
      (outcome === AutoBetOutcome.WIN || outcome === AutoBetOutcome.LOSS)
    ) {
      if (this._netResultCents <= -this._stopLoss.toCents()) {
        this.completeInternal(AutoBetCompletionReason.STOP_LOSS);
      } else if (
        this._stopWin !== null &&
        this._netResultCents >= this._stopWin.toCents()
      ) {
        this.completeInternal(AutoBetCompletionReason.STOP_WIN);
      } else if (
        this._maxRounds !== null &&
        this._roundsPlayed >= this._maxRounds
      ) {
        this.completeInternal(AutoBetCompletionReason.MAX_ROUNDS);
      }
    }

    this._version += 1;
    this._updatedAt = now;
  }

  /**
   * Parada manual (REST). Só de `ACTIVE`. Semântica **"saí agora"**: limpa
   * `currentRoundId`/`currentBetId`, então se havia uma aposta numa rodada **ainda não
   * liquidada**, o desfecho dela (WIN/LOSS) **não** é dobrado no `netResult`/`totalWagered` da
   * sessão (o `reconcile` daquela rodada vira no-op por `currentRoundId=null`). Decisão de
   * produto intencional (MINOR-3 da revisão): a aposta em si **liquida normalmente** no lado do
   * `Bet` (dinheiro correto); só o P&L *reportado* da sessão omite essa última rodada em voo.
   */
  stop(now: Date): Result<void, AutoBetNotActiveError> {
    if (this._status !== AutoBetStatus.ACTIVE) {
      return Result.fail(new AutoBetNotActiveError());
    }
    this._status = AutoBetStatus.STOPPED;
    this._completionReason = AutoBetCompletionReason.MANUAL;
    this._currentRoundId = null;
    this._currentBetId = null;
    this._version += 1;
    this._updatedAt = now;
    return Result.ok(undefined);
  }

  /** Marca COMPLETED + razão, sem bumpar version (o caller agrega o bump). */
  private completeInternal(reason: AutoBetCompletionReason): void {
    this._status = AutoBetStatus.COMPLETED;
    this._completionReason = reason;
    this._currentRoundId = null;
    this._currentBetId = null;
  }

  static reconstitute(state: AutoBetSessionState): AutoBetSession {
    return new AutoBetSession(state);
  }
}
