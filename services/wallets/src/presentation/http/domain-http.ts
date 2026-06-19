import {
  BadRequestException,
  ConflictException,
  HttpException,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import type { DomainError, Result } from "@crash-game/domain-kit";

/**
 * Boundary domínio→HTTP: desembrulha um `Result`; se for falha, traduz o
 * `DomainError` (pelo `code` estável) para a `HttpException` correta. O
 * `AllExceptionsFilter` (nestjs-kit) repassa a `HttpException` ao cliente.
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
    case "WALLET_NOT_FOUND":
      return new NotFoundException(error.message);
    case "WALLET_ALREADY_EXISTS":
    case "INSUFFICIENT_FUNDS":
    case "WALLET_CONCURRENCY":
    case "IDEMPOTENCY_KEY_CONFLICT":
      return new ConflictException(error.message);
    case "INVALID_AMOUNT":
      return new UnprocessableEntityException(error.message);
    default:
      return new BadRequestException(error.message);
  }
}
