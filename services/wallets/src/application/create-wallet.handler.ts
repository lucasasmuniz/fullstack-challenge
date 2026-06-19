import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { UniqueConstraintViolationException } from "@mikro-orm/core";
import { Result } from "@crash-game/domain-kit";
import { Wallet, WalletAlreadyExistsError } from "../domain";
import {
  WALLET_REPOSITORY,
  type WalletRepository,
} from "./wallet.repository";
import { toWalletView, type WalletView } from "./wallet.view";

const DEFAULT_CURRENCY = "BRL";

/** Cria a carteira do jogador autenticado (1 por jogador). */
@Injectable()
export class CreateWalletHandler {
  constructor(
    @Inject(WALLET_REPOSITORY) private readonly wallets: WalletRepository,
  ) {}

  async execute(
    playerId: string,
  ): Promise<Result<WalletView, WalletAlreadyExistsError>> {
    const existing = await this.wallets.findViewByPlayerId(playerId);
    if (existing) {
      return Result.fail(new WalletAlreadyExistsError());
    }
    const wallet = Wallet.create({
      walletId: randomUUID(),
      playerId,
      currency: DEFAULT_CURRENCY,
    }).unwrap();
    try {
      await this.wallets.save(wallet);
    } catch (error) {
      // Corrida de dois creates p/ o mesmo player → UNIQUE(player_id) na projeção.
      if (error instanceof UniqueConstraintViolationException) {
        return Result.fail(new WalletAlreadyExistsError());
      }
      throw error;
    }
    return Result.ok(toWalletView(wallet));
  }
}
