/**
 * Ciclo de vida da aposta. A saga de dinheiro (Etapa 5) move
 * `PENDING_FUNDS → CONFIRMED | REJECTED`; o desfecho da rodada move
 * `CONFIRMED → CASHED_OUT | LOST`. `REJECTED`, `CASHED_OUT` e `LOST` são terminais.
 *
 * Objeto `const` (não enum TS) — permite `BetStatus.CONFIRMED` e um tipo união estreito.
 */
export const BetStatus = {
  PENDING_FUNDS: "PENDING_FUNDS",
  CONFIRMED: "CONFIRMED",
  REJECTED: "REJECTED",
  CASHED_OUT: "CASHED_OUT",
  LOST: "LOST",
} as const;

export type BetStatus = (typeof BetStatus)[keyof typeof BetStatus];
