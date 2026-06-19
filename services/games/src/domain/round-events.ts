import { DomainEvent } from "@crash-game/domain-kit";

/**
 * Domain events da rodada (in-process). No Game o estado é a fonte da verdade
 * (CQRS, não event sourcing); estes eventos são **side-output**: alimentam projeções,
 * WebSocket e a outbox (Etapas 4–6).
 *
 * Regra de vazamento: `RoundOpened` (→ `betting_started`) expõe **só dados públicos**
 * — `serverSeedHash` (commitment) e `publicSeed`. **Nunca** o `crashPointX100` nem a
 * `serverSeed`: revelá-los antes do crash entregaria o resultado. O `serverSeed` só
 * aparece em `RoundCrashed` (pós-crash, para o `verify`).
 */

export class RoundOpened extends DomainEvent {
  readonly eventName = "RoundOpened";
  constructor(
    readonly roundId: string,
    readonly roundNumber: number,
    readonly serverSeedHash: string,
    readonly publicSeed: string,
    readonly bettingEndsAt: Date,
    occurredAt?: Date,
  ) {
    super(occurredAt);
  }
}

export class RoundStarted extends DomainEvent {
  readonly eventName = "RoundStarted";
  constructor(
    readonly roundId: string,
    readonly startedAt: Date,
    occurredAt?: Date,
  ) {
    super(occurredAt);
  }
}

export class RoundCrashed extends DomainEvent {
  readonly eventName = "RoundCrashed";
  constructor(
    readonly roundId: string,
    readonly crashPointX100: number,
    readonly serverSeed: string,
    readonly publicSeed: string,
    readonly crashedAt: Date,
    occurredAt?: Date,
  ) {
    super(occurredAt);
  }
}

export class RoundSettled extends DomainEvent {
  readonly eventName = "RoundSettled";
  constructor(
    readonly roundId: string,
    readonly settledAt: Date,
    occurredAt?: Date,
  ) {
    super(occurredAt);
  }
}

export type RoundDomainEvent =
  | RoundOpened
  | RoundStarted
  | RoundCrashed
  | RoundSettled;
