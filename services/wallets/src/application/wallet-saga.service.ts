import { Inject, Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { UniqueConstraintViolationException } from "@mikro-orm/core";
import { Money } from "@crash-game/money";
import { IntegrationEventType, type IntegrationMessage } from "@crash-game/contracts";
import type { Wallet } from "../domain";
import {
  WALLET_REPOSITORY,
  type OutboxMessage,
  type WalletRepository,
} from "./wallet.repository";
import { REALTIME_PUBLISHER, type RealtimePublisher } from "./realtime.port";

const MAX_ATTEMPTS = 4;

type SagaStep = { wallet: Wallet | null; outbox: OutboxMessage } | "done";

/**
 * Consome os comandos da saga (Game→Wallet) e aplica ao ledger, publicando o resultado na outbox na
 * mesma transação (exactly-once). Idempotência em camadas: inbox por `messageId`, ledger
 * `UNIQUE(wallet_id, reason, betId)` e retry sob conflito de `version`. Saldo insuficiente é regra de
 * negócio (`FundsDebitRejected`), não throw para DLQ.
 */
@Injectable()
export class WalletSagaService {
  private readonly logger = new Logger(WalletSagaService.name);

  constructor(
    @Inject(WALLET_REPOSITORY) private readonly wallets: WalletRepository,
    @Inject(REALTIME_PUBLISHER) private readonly realtime: RealtimePublisher,
  ) {}

  /**
   * Credita a carteira (cashout ou refund). Sem recusa de negócio (valor positivo): só idempotência +
   * concorrência. Carteira inexistente é inconsistência real → throw (DLQ; dinheiro devido nunca some).
   */
  async onCreditFunds(msg: IntegrationMessage<"CreditFunds">): Promise<void> {
    const { betId, playerId, amountCents, reason } = msg.payload;
    if (await this.wallets.wasMessageProcessed(msg.messageId)) {
      return;
    }
    const amount = Money.fromCents(amountCents);

    await this.withVersionRetry(msg, async () => {
      const wallet = await this.wallets.findByPlayerId(playerId);
      if (!wallet) {
        throw new Error(
          `CreditFunds para carteira inexistente (player ${playerId}, bet ${betId}).`,
        );
      }
      const seen = await this.wallets.findProcessedMovement(wallet.id, reason, betId);
      if (seen) {
        return { wallet: null, outbox: this.credited(msg) };
      }
      const res = wallet.credit(amount, reason, betId);
      if (res.isFail) {
        throw new Error(`Crédito inválido (bet ${betId}): ${res.unwrapError().message}`);
      }
      return { wallet, outbox: this.credited(msg) };
    });
  }

  async onDebitFunds(msg: IntegrationMessage<"DebitFunds">): Promise<void> {
    const { betId, playerId, amountCents } = msg.payload;
    if (await this.wallets.wasMessageProcessed(msg.messageId)) {
      return;
    }
    const amount = Money.fromCents(amountCents);

    await this.withVersionRetry(msg, async () => {
      const wallet = await this.wallets.findByPlayerId(playerId);
      if (!wallet) {
        this.logger.warn(`DebitFunds para carteira inexistente (player ${playerId}).`);
        return { wallet: null, outbox: this.rejected(msg, "wallet not found") };
      }
      const seen = await this.wallets.findProcessedMovement(wallet.id, "bet", betId);
      if (seen) {
        return { wallet: null, outbox: this.debited(msg) };
      }
      const res = wallet.debit(amount, "bet", betId);
      return res.isFail
        ? { wallet: null, outbox: this.rejected(msg, res.unwrapError().message) }
        : { wallet, outbox: this.debited(msg) };
    });
  }

  /**
   * Retry sob conflito de `version` (contenção na mesma carteira). Desambigua a
   * `UniqueConstraintViolation`: `messageId` já na inbox → reentrega → ack seco; senão é conflito de
   * version → reexecuta. Esgotou → throw (sem ack → retry/DLQ).
   */
  private async withVersionRetry(
    msg: IntegrationMessage,
    attempt: () => Promise<SagaStep>,
  ): Promise<void> {
    for (let i = 0; i < MAX_ATTEMPTS; i += 1) {
      const step = await attempt();
      if (step === "done") {
        return;
      }
      try {
        await this.wallets.appendSagaResult(step.wallet, step.outbox, {
          messageId: msg.messageId,
          type: msg.type,
        });
        if (step.wallet) {
          this.realtime.emitBalance(step.wallet.playerId, {
            balanceCents: Number(step.wallet.balance.toCents()),
            currency: step.wallet.currency,
          });
        }
        return;
      } catch (err) {
        if (!(err instanceof UniqueConstraintViolationException)) {
          throw err;
        }
        if (await this.wallets.wasMessageProcessed(msg.messageId)) {
          return;
        }
      }
    }
    throw new Error(
      `Mensagem ${msg.type} não aplicada após ${MAX_ATTEMPTS} tentativas (msg ${msg.messageId}).`,
    );
  }

  private debited(msg: IntegrationMessage<"DebitFunds">): OutboxMessage {
    return {
      id: randomUUID(),
      type: IntegrationEventType.FundsDebited,
      payload: {
        betId: msg.payload.betId,
        roundId: msg.payload.roundId,
        playerId: msg.payload.playerId,
        amountCents: msg.payload.amountCents,
      },
    };
  }

  private rejected(
    msg: IntegrationMessage<"DebitFunds">,
    reason: string,
  ): OutboxMessage {
    return {
      id: randomUUID(),
      type: IntegrationEventType.FundsDebitRejected,
      payload: {
        betId: msg.payload.betId,
        roundId: msg.payload.roundId,
        playerId: msg.payload.playerId,
        amountCents: msg.payload.amountCents,
        reason,
      },
    };
  }

  private credited(msg: IntegrationMessage<"CreditFunds">): OutboxMessage {
    return {
      id: randomUUID(),
      type: IntegrationEventType.FundsCredited,
      payload: {
        betId: msg.payload.betId,
        playerId: msg.payload.playerId,
        amountCents: msg.payload.amountCents,
        reason: msg.payload.reason,
      },
    };
  }
}
