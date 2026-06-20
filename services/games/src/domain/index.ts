// Provably fair (server-only)
export {
  ProvablyFairDomainService,
  type ProvablyFairVerification,
} from "./provably-fair.service";
export {
  DEFAULT_PROVABLY_FAIR_POLICY,
  type ProvablyFairPolicy,
} from "./provably-fair-policy";

// Round aggregate
export { Round, type RoundState } from "./round";
export { RoundStatus } from "./round-status";
export {
  RoundOpened,
  RoundStarted,
  RoundCrashed,
  RoundSettled,
  type RoundDomainEvent,
} from "./round-events";
export { InvalidRoundTransitionError } from "./round-errors";

// Bet aggregate
export { Bet, type BetState } from "./bet";
export { BetStatus } from "./bet-status";
export { DEFAULT_BET_LIMITS, type BetLimits } from "./bet-limits";
export {
  BetPlaced,
  BetConfirmed,
  BetRejected,
  BetCashedOut,
  BetLost,
  BetRefunded,
  type BetDomainEvent,
} from "./bet-events";
export {
  BetAmountOutOfRangeError,
  InvalidAutoCashoutTargetError,
  BetNotPendingError,
  BetNotCashableError,
  InvalidCashoutMultiplierError,
  CashoutAboveCrashError,
  BetNotConfirmedError,
  BetAlreadyExistsError,
  NoBettingRoundError,
  RoundNotRunningError,
  NoBetToCashoutError,
} from "./bet-errors";
