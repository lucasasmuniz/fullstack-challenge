import { DomainEvent } from "@crash-game/domain-kit";

/**
 * Domain events da aposta (in-process). Alimentam projeções (bets/me, apostas da
 * rodada), WebSocket (`bet.placed`/`bet.cashed_out`) e a outbox da saga (Etapas 4–6).
 * O `Bet` é agregado separado: referencia a rodada só por `roundId`.
 */

export class BetPlaced extends DomainEvent {
  readonly eventName = "BetPlaced";
  constructor(
    readonly betId: string,
    readonly roundId: string,
    readonly playerId: string,
    readonly amountCents: bigint,
    readonly autoCashoutTargetX100: number | null,
    readonly placedAt: Date,
    occurredAt?: Date,
  ) {
    super(occurredAt);
  }
}

export class BetConfirmed extends DomainEvent {
  readonly eventName = "BetConfirmed";
  constructor(
    readonly betId: string,
    readonly confirmedAt: Date,
    occurredAt?: Date,
  ) {
    super(occurredAt);
  }
}

export class BetRejected extends DomainEvent {
  readonly eventName = "BetRejected";
  constructor(
    readonly betId: string,
    readonly reason: string,
    readonly rejectedAt: Date,
    occurredAt?: Date,
  ) {
    super(occurredAt);
  }
}

export class BetCashedOut extends DomainEvent {
  readonly eventName = "BetCashedOut";
  constructor(
    readonly betId: string,
    readonly multiplierX100: number,
    readonly payoutCents: bigint,
    readonly cashedOutAt: Date,
    occurredAt?: Date,
  ) {
    super(occurredAt);
  }
}

export class BetLost extends DomainEvent {
  readonly eventName = "BetLost";
  constructor(
    readonly betId: string,
    readonly lostAt: Date,
    occurredAt?: Date,
  ) {
    super(occurredAt);
  }
}

export type BetDomainEvent =
  | BetPlaced
  | BetConfirmed
  | BetRejected
  | BetCashedOut
  | BetLost;
