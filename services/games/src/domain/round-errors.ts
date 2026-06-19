import { DomainError } from "@crash-game/domain-kit";
import type { RoundStatus } from "./round-status";

/**
 * Transição de estado inválida da rodada (ex.: `start` fora de `BETTING`, `crash`
 * fora de `RUNNING`). Regra de negócio esperada → `Result.fail` (não exception).
 * Mapeado para HTTP 409 (conflito de estado).
 */
export class InvalidRoundTransitionError extends DomainError {
  readonly code = "INVALID_ROUND_TRANSITION";
  constructor(from: RoundStatus, to: RoundStatus) {
    super(`Transição de rodada inválida: ${from} → ${to}`);
  }
}
