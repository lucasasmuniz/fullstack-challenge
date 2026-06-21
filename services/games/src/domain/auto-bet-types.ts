/** Estratégia de progressão da aposta automática. */
export enum AutoBetStrategy {
  /** Valor fixo todo round (= `baseAmount`). */
  FIXED = "FIXED",
  /** Dobra na perda, reseta para `baseAmount` na vitória. */
  MARTINGALE = "MARTINGALE",
}

/**
 * Desfecho de uma rodada para a sessão (reconciliação no settlement). **Máquina de 3 vias +
 * REJECTED** (CRÍTICO — integridade do Martingale sob latência de SQS):
 * - `WIN` (bet `CASHED_OUT`): reseta a progressão, soma o lucro, conta a rodada.
 * - `LOSS` (bet `LOST` confirmada): aplica o Martingale, subtrai a aposta, conta a rodada.
 * - `SKIPPED` (bet não atingiu `CONFIRMED` antes do crash — `PENDING/REFUNDED`): **dinheiro
 *   não participou do risco** → P&L intacto, rodada **não** conta, `nextAmount` **inalterado**.
 * - `REJECTED` (débito recusado por saldo insuficiente): sem P&L, mas **encerra** a sessão.
 */
export enum AutoBetOutcome {
  WIN = "WIN",
  LOSS = "LOSS",
  SKIPPED = "SKIPPED",
  REJECTED = "REJECTED",
}

/** Por que a sessão terminou (auditoria + GET /me). */
export enum AutoBetCompletionReason {
  STOP_LOSS = "STOP_LOSS",
  STOP_WIN = "STOP_WIN",
  MAX_ROUNDS = "MAX_ROUNDS",
  BUDGET_EXCEEDED = "BUDGET_EXCEEDED",
  MAX_BET_EXCEEDED = "MAX_BET_EXCEEDED",
  INSUFFICIENT_FUNDS = "INSUFFICIENT_FUNDS",
  MANUAL = "MANUAL",
}
