/**
 * Motivo de um movimento no ledger. usa `deposit`/`withdrawal`/`initial`
 * (REST intra-contexto + seed); `bet`/`cashout`/`refund` existem no tipo para a saga
 * cross-service (consumidos via SQS).
 */
export const WALLET_REASONS = [
  "deposit",
  "withdrawal",
  "bet",
  "cashout",
  "refund",
  "initial",
] as const;

export type WalletReason = (typeof WALLET_REASONS)[number];
