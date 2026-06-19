import { Injectable } from "@nestjs/common";
import type { Result, DomainError } from "@crash-game/domain-kit";
import { WalletMovementService } from "./wallet-movement.service";
import type { WalletView } from "./wallet.view";

/**
 * Saque (débito `reason=withdrawal`) da própria carteira. Respeita o saldo
 * (a checagem de saldo insuficiente vive em `Wallet.debit`) e reusa a mecânica de
 * idempotência/concorrência de {@link WalletMovementService}.
 */
@Injectable()
export class WithdrawHandler {
  constructor(private readonly movements: WalletMovementService) {}

  execute(
    playerId: string,
    amountCents: bigint,
    correlationId: string,
  ): Promise<Result<WalletView, DomainError>> {
    return this.movements.apply(
      playerId,
      "withdrawal",
      amountCents,
      correlationId,
      (wallet, amount) => wallet.debit(amount, "withdrawal", correlationId),
    );
  }
}
