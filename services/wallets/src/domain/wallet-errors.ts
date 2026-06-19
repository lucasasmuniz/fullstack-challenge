import { DomainError } from "@crash-game/domain-kit";

/** Saldo insuficiente para o débito. Mapeado para HTTP 409. */
export class InsufficientFundsError extends DomainError {
  readonly code = "INSUFFICIENT_FUNDS";
  constructor() {
    super("Saldo insuficiente para a operação");
  }
}

/** Carteira não encontrada para o jogador. Mapeado para HTTP 404. */
export class WalletNotFoundError extends DomainError {
  readonly code = "WALLET_NOT_FOUND";
  constructor() {
    super("Carteira não encontrada");
  }
}

/** Tentativa de criar carteira já existente. Mapeado para HTTP 409. */
export class WalletAlreadyExistsError extends DomainError {
  readonly code = "WALLET_ALREADY_EXISTS";
  constructor() {
    super("Carteira já existe para este jogador");
  }
}

/** Valor monetário inválido (ex: zero). Mapeado para HTTP 422. */
export class InvalidAmountError extends DomainError {
  readonly code = "INVALID_AMOUNT";
  constructor() {
    super("Valor da operação deve ser maior que zero");
  }
}

/**
 * Conflito de concorrência não resolvido após N retries (contenção persistente na
 * mesma carteira). Mapeado para HTTP 409 — sinaliza ao cliente para tentar de novo,
 * em vez de reportar um falso sucesso. NÃO confundir com retry idempotente.
 */
export class WalletConcurrencyError extends DomainError {
  readonly code = "WALLET_CONCURRENCY";
  constructor() {
    super("Conflito de concorrência na carteira; tente novamente");
  }
}

/**
 * Mesma `Idempotency-Key` reapresentada com um **payload diferente** (ex: outro
 * valor). A 1ª intenção é a verdade; aceitar a 2ª silenciosamente mascararia um bug
 * de cliente. Mapeado para HTTP 409. (Comportamento à la Stripe: a key amarra o
 * payload original.)
 */
export class IdempotencyKeyConflictError extends DomainError {
  readonly code = "IDEMPOTENCY_KEY_CONFLICT";
  constructor() {
    super("Idempotency-Key já usada com um valor diferente");
  }
}
