import { AggregateRoot, Result } from "@crash-game/domain-kit";
import { Money } from "@crash-game/money";
import { BetStatus } from "./bet-status";
import type { BetLimits } from "./bet-limits";
import {
  BetCashedOut,
  BetConfirmed,
  BetLost,
  BetPlaced,
  BetRefunded,
  BetRejected,
} from "./bet-events";
import {
  BetAmountOutOfRangeError,
  BetNotCashableError,
  BetNotConfirmedError,
  BetNotPendingError,
  CashoutAboveCrashError,
  InvalidAutoCashoutTargetError,
  InvalidCashoutMultiplierError,
} from "./bet-errors";

/** `1.00x` em inteiro ×100 — piso de qualquer multiplicador. */
const MIN_MULTIPLIER_X100 = 100;

export interface BetState {
  betId: string;
  roundId: string;
  playerId: string;
  username: string;
  amount: Money;
  status: BetStatus;
  autoCashoutTargetX100: number | null;
  cashoutMultiplierX100: number | null;
  payout: Money | null;
  version: number;
  placedAt: Date;
  confirmedAt: Date | null;
  resolvedAt: Date | null;
}

/**
 * Aposta — agregado separado, referencia a rodada só por `roundId`. O estado é a fonte da
 * verdade; `version` habilita concorrência otimista no repositório. A máquina de estados é a
 * 1ª linha contra dupla liquidação: `cashout` só sai de `CONFIRMED`.
 */
export class Bet extends AggregateRoot<string> {
  private _roundId: string;
  private _playerId: string;
  private _username: string;
  private _amount: Money;
  private _status: BetStatus;
  private _autoCashoutTargetX100: number | null;
  private _cashoutMultiplierX100: number | null;
  private _payout: Money | null;
  private _version: number;
  private _placedAt: Date;
  private _confirmedAt: Date | null;
  private _resolvedAt: Date | null;

  private constructor(state: BetState) {
    super(state.betId);
    this._roundId = state.roundId;
    this._playerId = state.playerId;
    this._username = state.username;
    this._amount = state.amount;
    this._status = state.status;
    this._autoCashoutTargetX100 = state.autoCashoutTargetX100;
    this._cashoutMultiplierX100 = state.cashoutMultiplierX100;
    this._payout = state.payout;
    this._version = state.version;
    this._placedAt = state.placedAt;
    this._confirmedAt = state.confirmedAt;
    this._resolvedAt = state.resolvedAt;
  }

  get roundId(): string {
    return this._roundId;
  }
  get playerId(): string {
    return this._playerId;
  }
  get username(): string {
    return this._username;
  }
  get amount(): Money {
    return this._amount;
  }
  get status(): BetStatus {
    return this._status;
  }
  get autoCashoutTargetX100(): number | null {
    return this._autoCashoutTargetX100;
  }
  get cashoutMultiplierX100(): number | null {
    return this._cashoutMultiplierX100;
  }
  get payout(): Money | null {
    return this._payout;
  }
  get version(): number {
    return this._version;
  }
  get placedAt(): Date {
    return this._placedAt;
  }
  get confirmedAt(): Date | null {
    return this._confirmedAt;
  }
  get resolvedAt(): Date | null {
    return this._resolvedAt;
  }

  /**
   * Registra uma aposta nova em `PENDING_FUNDS` (aguarda débito via saga). Valida valor em
   * `[min, max]` e o alvo de auto-cashout. "1 aposta/jogador/rodada" é garantida por
   * `UNIQUE(round_id, player_id)` no banco, não aqui (agregados separados).
   */
  static place(
    props: {
      betId: string;
      roundId: string;
      playerId: string;
      username: string;
      amount: Money;
      autoCashoutTargetX100?: number | null;
    },
    limits: BetLimits,
    now: Date,
  ): Result<Bet, BetAmountOutOfRangeError | InvalidAutoCashoutTargetError> {
    if (
      props.amount.isLessThan(limits.min) ||
      limits.max.isLessThan(props.amount)
    ) {
      return Result.fail(new BetAmountOutOfRangeError());
    }
    const target = props.autoCashoutTargetX100 ?? null;
    if (
      target !== null &&
      (!Number.isInteger(target) || target <= MIN_MULTIPLIER_X100)
    ) {
      return Result.fail(new InvalidAutoCashoutTargetError());
    }

    const bet = new Bet({
      betId: props.betId,
      roundId: props.roundId,
      playerId: props.playerId,
      username: props.username,
      amount: props.amount,
      status: BetStatus.PENDING_FUNDS,
      autoCashoutTargetX100: target,
      cashoutMultiplierX100: null,
      payout: null,
      version: 1,
      placedAt: now,
      confirmedAt: null,
      resolvedAt: null,
    });
    bet.addEvent(
      new BetPlaced(
        bet.id,
        bet._roundId,
        bet._playerId,
        bet._amount.toCents(),
        target,
        now,
        now,
      ),
    );
    return Result.ok(bet);
  }

  confirm(now: Date): Result<void, BetNotPendingError> {
    if (this._status !== BetStatus.PENDING_FUNDS) {
      return Result.fail(new BetNotPendingError());
    }
    this._status = BetStatus.CONFIRMED;
    this._confirmedAt = now;
    this._version += 1;
    this.addEvent(new BetConfirmed(this.id, now, now));
    return Result.ok(undefined);
  }

  reject(reason: string, now: Date): Result<void, BetNotPendingError> {
    if (this._status !== BetStatus.PENDING_FUNDS) {
      return Result.fail(new BetNotPendingError());
    }
    this._status = BetStatus.REJECTED;
    this._resolvedAt = now;
    this._version += 1;
    this.addEvent(new BetRejected(this.id, reason, now, now));
    return Result.ok(undefined);
  }

  /**
   * `CONFIRMED → CASHED_OUT`. O `multiplierX100` é autoridade do servidor (vem do `Round`,
   * nunca do payload). Valida estado `CONFIRMED` (anti dupla-liquidação), multiplicador
   * inteiro ≥ 1.00x e ≤ crash point. Payout = `floor(amount × mult / 100)`.
   */
  cashout(
    multiplierX100: number,
    crashPointX100: number,
    now: Date,
  ): Result<
    void,
    BetNotCashableError | InvalidCashoutMultiplierError | CashoutAboveCrashError
  > {
    if (this._status !== BetStatus.CONFIRMED) {
      return Result.fail(new BetNotCashableError());
    }
    if (
      !Number.isInteger(multiplierX100) ||
      multiplierX100 < MIN_MULTIPLIER_X100
    ) {
      return Result.fail(new InvalidCashoutMultiplierError());
    }
    if (multiplierX100 > crashPointX100) {
      return Result.fail(new CashoutAboveCrashError());
    }
    const payout = this._amount.multipliedBy(multiplierX100);
    this._status = BetStatus.CASHED_OUT;
    this._cashoutMultiplierX100 = multiplierX100;
    this._payout = payout;
    this._resolvedAt = now;
    this._version += 1;
    this.addEvent(
      new BetCashedOut(this.id, multiplierX100, payout.toCents(), now, now),
    );
    return Result.ok(undefined);
  }

  markLost(now: Date): Result<void, BetNotConfirmedError> {
    if (this._status !== BetStatus.CONFIRMED) {
      return Result.fail(new BetNotConfirmedError());
    }
    this._status = BetStatus.LOST;
    this._resolvedAt = now;
    this._version += 1;
    this.addEvent(new BetLost(this.id, now, now));
    return Result.ok(undefined);
  }

  /**
   * `PENDING_FUNDS → REFUNDED` — compensação de late-debit: o débito confirmou depois de a
   * rodada terminar (a aposta nunca participou), então o valor é restituído. Só sai de
   * `PENDING_FUNDS`.
   */
  refund(now: Date): Result<void, BetNotPendingError> {
    if (this._status !== BetStatus.PENDING_FUNDS) {
      return Result.fail(new BetNotPendingError());
    }
    this._status = BetStatus.REFUNDED;
    this._resolvedAt = now;
    this._version += 1;
    this.addEvent(new BetRefunded(this.id, now, now));
    return Result.ok(undefined);
  }

  static reconstitute(state: BetState): Bet {
    return new Bet(state);
  }
}
