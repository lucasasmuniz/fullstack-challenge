import { Injectable } from "@nestjs/common";
import type { Result, DomainError } from "@crash-game/domain-kit";
import { WalletMovementService } from "./wallet-movement.service";
import type { WalletView } from "./wallet.view";

/**
 * Depósito (crédito `reason=deposit`) na própria carteira. Idempotente pelo
 * `correlationId` (Idempotency-Key) e seguro sob concorrência — toda essa mecânica
 * vive em {@link WalletMovementService}; aqui só fixamos a operação de domínio.
 */
@Injectable()
export class DepositHandler {
  constructor(private readonly movements: WalletMovementService) {}

  execute(
    playerId: string,
    amountCents: bigint,
    correlationId: string,
  ): Promise<Result<WalletView, DomainError>> {
    return this.movements.apply(
      playerId,
      "deposit",
      amountCents,
      correlationId,
      (wallet, amount) => wallet.credit(amount, "deposit", correlationId),
    );
  }
}
