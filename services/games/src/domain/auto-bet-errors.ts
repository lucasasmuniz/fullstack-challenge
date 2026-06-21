import { DomainError } from "@crash-game/domain-kit";

/** Configuração inválida ao iniciar a sessão de auto-bet. Mapeado para HTTP 422. */
export class AutoBetInvalidConfigError extends DomainError {
  readonly code = "AUTO_BET_INVALID_CONFIG";
  constructor(detail: string) {
    super(`Configuração de auto-bet inválida: ${detail}`);
  }
}

/** Operação (ex.: parar) numa sessão que não está `ACTIVE`. Mapeado para HTTP 409. */
export class AutoBetNotActiveError extends DomainError {
  readonly code = "AUTO_BET_NOT_ACTIVE";
  constructor() {
    super("Nenhuma sessão de auto-bet ativa");
  }
}

/** Já existe uma sessão `ACTIVE` para o jogador (1 por jogador). Mapeado para HTTP 409. */
export class AutoBetAlreadyActiveError extends DomainError {
  readonly code = "AUTO_BET_ALREADY_ACTIVE";
  constructor() {
    super("Já existe uma sessão de auto-bet ativa para este jogador");
  }
}
