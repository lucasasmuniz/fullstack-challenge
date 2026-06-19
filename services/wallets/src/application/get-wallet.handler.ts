import { Inject, Injectable } from "@nestjs/common";
import { Result } from "@crash-game/domain-kit";
import { WalletNotFoundError } from "../domain";
import {
  WALLET_REPOSITORY,
  type WalletRepository,
} from "./wallet.repository";
import type { WalletView } from "./wallet.view";

/** Lê o saldo do jogador autenticado (projeção / read model). */
@Injectable()
export class GetWalletHandler {
  constructor(
    @Inject(WALLET_REPOSITORY) private readonly wallets: WalletRepository,
  ) {}

  async execute(
    playerId: string,
  ): Promise<Result<WalletView, WalletNotFoundError>> {
    const view = await this.wallets.findViewByPlayerId(playerId);
    if (!view) {
      return Result.fail(new WalletNotFoundError());
    }
    return Result.ok(view);
  }
}
