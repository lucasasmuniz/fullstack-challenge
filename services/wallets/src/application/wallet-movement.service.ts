import { Inject, Injectable } from "@nestjs/common";
import { UniqueConstraintViolationException } from "@mikro-orm/core";
import { Result, type DomainError } from "@crash-game/domain-kit";
import { Money } from "@crash-game/money";
import {
  IdempotencyKeyConflictError,
  WalletConcurrencyError,
  WalletNotFoundError,
  type Wallet,
  type WalletReason,
} from "../domain";
import {
  WALLET_REPOSITORY,
  type WalletRepository,
} from "./wallet.repository";
import { toWalletView, type WalletView } from "./wallet.view";
import { REALTIME_PUBLISHER, type RealtimePublisher } from "./realtime.port";
import { WalletMetrics } from "../infrastructure/observability/wallet-metrics";

const MAX_ATTEMPTS = 4;

export type WalletOperation = (
  wallet: Wallet,
  amount: Money,
) => Result<void, DomainError>;

/**
 * Núcleo compartilhado de deposit/withdraw: idempotência escopada por carteira + retry sob conflito
 * de version, num único lugar, para os dois caminhos de dinheiro não divergirem (a operação concreta
 * entra via `operate`).
 */
@Injectable()
export class WalletMovementService {
  constructor(
    @Inject(WALLET_REPOSITORY) private readonly wallets: WalletRepository,
    @Inject(REALTIME_PUBLISHER) private readonly realtime: RealtimePublisher,
    private readonly metrics: WalletMetrics,
  ) {}

  async apply(
    playerId: string,
    reason: WalletReason,
    amountCents: bigint,
    correlationId: string,
    operate: WalletOperation,
  ): Promise<Result<WalletView, DomainError>> {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      const wallet = await this.wallets.findByPlayerId(playerId);
      if (!wallet) {
        return Result.fail(new WalletNotFoundError());
      }

      const seen = await this.wallets.findProcessedMovement(
        wallet.id,
        reason,
        correlationId,
      );
      if (seen) {
        return this.idempotentResult(playerId, seen.amountCents, amountCents);
      }

      const applied = operate(wallet, Money.fromCents(amountCents));
      if (applied.isFail) {
        return Result.fail(applied.unwrapError());
      }

      try {
        await this.wallets.save(wallet);
        const view = toWalletView(wallet);
        this.metrics.record(reason, amountCents);
        this.realtime.emitBalance(playerId, {
          balanceCents: Number(view.balanceCents),
          currency: view.currency,
        });
        return Result.ok(view);
      } catch (error) {
        if (!(error instanceof UniqueConstraintViolationException)) {
          throw error;
        }
        const racing = await this.wallets.findProcessedMovement(
          wallet.id,
          reason,
          correlationId,
        );
        if (racing) {
          return this.idempotentResult(playerId, racing.amountCents, amountCents);
        }
      }
    }

    return Result.fail(new WalletConcurrencyError());
  }

  /** Payload igual → no-op (estado atual); diferente → conflito de key. */
  private idempotentResult(
    playerId: string,
    seenAmount: bigint,
    requestedAmount: bigint,
  ): Promise<Result<WalletView, DomainError>> {
    if (seenAmount !== requestedAmount) {
      return Promise.resolve(Result.fail(new IdempotencyKeyConflictError()));
    }
    return this.currentView(playerId);
  }

  private async currentView(
    playerId: string,
  ): Promise<Result<WalletView, DomainError>> {
    const view = await this.wallets.findViewByPlayerId(playerId);
    return view ? Result.ok(view) : Result.fail(new WalletNotFoundError());
  }
}
