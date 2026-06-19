import { DomainError } from "@crash-game/domain-kit";

/** Valor da aposta fora de `[min, max]`. Mapeado para HTTP 422. */
export class BetAmountOutOfRangeError extends DomainError {
  readonly code = "BET_AMOUNT_OUT_OF_RANGE";
  constructor() {
    super("Valor da aposta fora dos limites permitidos");
  }
}

/** Alvo de auto-cashout inválido (não inteiro ou ≤ 1.00x). Mapeado para HTTP 422. */
export class InvalidAutoCashoutTargetError extends DomainError {
  readonly code = "INVALID_AUTO_CASHOUT_TARGET";
  constructor() {
    super("Alvo de auto-cashout deve ser um inteiro maior que 1.00x");
  }
}

/** `confirm`/`reject` fora de `PENDING_FUNDS`. Mapeado para HTTP 409. */
export class BetNotPendingError extends DomainError {
  readonly code = "BET_NOT_PENDING";
  constructor() {
    super("Aposta não está aguardando confirmação de fundos");
  }
}

/**
 * `cashout` fora de `CONFIRMED` — inclui o caso do **cliente em pânico** clicando
 * várias vezes (a 1ª liquida → `CASHED_OUT`; as seguintes caem aqui). É explicitamente
 * uma **transição de estado inválida (HTTP 409)**, não falha técnica: a camada de
 * aplicação usa este `code` para distinguir uma **requisição redundante** (pode ser
 * silenciada/tratada na UI) de um erro crítico de sistema (5xx).
 */
export class BetNotCashableError extends DomainError {
  readonly code = "BET_NOT_CASHABLE";
  constructor() {
    super("Aposta não pode ser sacada no estado atual");
  }
}

/** Multiplicador de cashout inválido (não inteiro ou < 1.00x). Mapeado para HTTP 422. */
export class InvalidCashoutMultiplierError extends DomainError {
  readonly code = "INVALID_CASHOUT_MULTIPLIER";
  constructor() {
    super("Multiplicador de cashout deve ser um inteiro ≥ 1.00x");
  }
}

/** Tentativa de sacar acima do crash point da rodada. Mapeado para HTTP 422. */
export class CashoutAboveCrashError extends DomainError {
  readonly code = "CASHOUT_ABOVE_CRASH";
  constructor() {
    super("Multiplicador de cashout acima do ponto de crash da rodada");
  }
}

/** `markLost` fora de `CONFIRMED`. Mapeado para HTTP 409. */
export class BetNotConfirmedError extends DomainError {
  readonly code = "BET_NOT_CONFIRMED";
  constructor() {
    super("Aposta não está confirmada");
  }
}
