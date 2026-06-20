import {
  BadRequestException,
  ConflictException,
  HttpException,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import type { DomainError, Result } from "@crash-game/domain-kit";

/**
 * Boundary domínio→HTTP: desembrulha um `Result`; falha → traduz o `DomainError` (pelo
 * `code` estável) para a `HttpException` correta. O `AllExceptionsFilter` repassa ao cliente.
 *
 * Transições inválidas (aposta dupla, fora da fase, saque redundante) são **409** — pedido
 * redundante, não erro de sistema. Validação de valor/alvo/multiplicador é **422**.
 */
export function unwrapOrThrow<T, E extends DomainError>(
  result: Result<T, E>,
): T {
  if (result.isOk) {
    return result.unwrap();
  }
  throw toHttpException(result.unwrapError());
}

function toHttpException(error: DomainError): HttpException {
  switch (error.code) {
    case "NO_BETTING_ROUND":
    case "ROUND_NOT_RUNNING":
    case "BET_ALREADY_EXISTS":
    case "BET_NOT_PENDING":
    case "BET_NOT_CASHABLE":
    case "BET_NOT_CONFIRMED":
      return new ConflictException(error.message);
    case "NO_BET_TO_CASHOUT":
      return new NotFoundException(error.message);
    case "BET_AMOUNT_OUT_OF_RANGE":
    case "INVALID_AUTO_CASHOUT_TARGET":
    case "INVALID_CASHOUT_MULTIPLIER":
    case "CASHOUT_ABOVE_CRASH":
      return new UnprocessableEntityException(error.message);
    default:
      return new BadRequestException(error.message);
  }
}
