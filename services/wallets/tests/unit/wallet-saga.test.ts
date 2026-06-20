import { describe, it, expect } from "bun:test";
import { randomUUID } from "node:crypto";
import { Money } from "@crash-game/money";
import type { IntegrationMessage } from "@crash-game/contracts";
import { WalletSagaService } from "../../src/application/wallet-saga.service";
import type {
  InboxRef,
  OutboxMessage,
  WalletRepository,
} from "../../src/application/wallet.repository";
import type { WalletView } from "../../src/application/wallet.view";
import {
  Wallet,
  type WalletDomainEvent,
  type WalletReason,
} from "../../src/domain";

interface StoredEvent {
  event: WalletDomainEvent;
  reason?: WalletReason;
  correlationId?: string;
  amountCents: bigint;
}

/** Fake in-memory do repo: aplica `appendSagaResult` ao stream e registra a inbox/outbox. */
class FakeWalletRepository implements WalletRepository {
  private events = new Map<string, StoredEvent[]>();
  private players = new Map<string, string>();
  private inbox = new Set<string>();
  readonly outbox: OutboxMessage[] = [];

  seed(playerId: string, balanceCents: bigint): string {
    const wallet = Wallet.create({
      walletId: randomUUID(),
      playerId,
      currency: "BRL",
    }).unwrap();
    if (balanceCents > 0n) {
      wallet.credit(Money.fromCents(balanceCents), "initial", randomUUID());
    }
    this.players.set(playerId, wallet.id);
    this.events.set(wallet.id, []);
    this.persist(wallet);
    return wallet.id;
  }

  findByPlayerId(playerId: string): Promise<Wallet | null> {
    const walletId = this.players.get(playerId);
    if (!walletId) return Promise.resolve(null);
    const stream = this.events.get(walletId) ?? [];
    return Promise.resolve(Wallet.rebuild(stream.map((e) => e.event)));
  }

  findViewByPlayerId(playerId: string): Promise<WalletView | null> {
    const walletId = this.players.get(playerId);
    if (!walletId) return Promise.resolve(null);
    const wallet = Wallet.rebuild(
      (this.events.get(walletId) ?? []).map((e) => e.event),
    );
    return Promise.resolve({
      id: wallet.id,
      playerId: wallet.playerId,
      balanceCents: wallet.balance.toCents(),
      currency: wallet.currency,
      version: wallet.version,
    });
  }

  save(): Promise<void> {
    return Promise.reject(new Error("save não usado nestes testes"));
  }

  findProcessedMovement(
    walletId: string,
    reason: WalletReason,
    correlationId: string,
  ): Promise<{ amountCents: bigint } | null> {
    const stream = this.events.get(walletId) ?? [];
    const match = stream.find(
      (e) => e.reason === reason && e.correlationId === correlationId,
    );
    return Promise.resolve(match ? { amountCents: match.amountCents } : null);
  }

  appendSagaResult(
    wallet: Wallet | null,
    outbox: OutboxMessage,
    inbox: InboxRef,
  ): Promise<void> {
    if (wallet) {
      this.persist(wallet);
    }
    this.inbox.add(inbox.messageId);
    this.outbox.push(outbox);
    return Promise.resolve();
  }

  wasMessageProcessed(messageId: string): Promise<boolean> {
    return Promise.resolve(this.inbox.has(messageId));
  }

  balanceOf(playerId: string): bigint {
    const walletId = this.players.get(playerId);
    const wallet = Wallet.rebuild(
      (this.events.get(walletId ?? "") ?? []).map((e) => e.event),
    );
    return wallet.balance.toCents();
  }

  private persist(wallet: Wallet): void {
    const stream = this.events.get(wallet.id) ?? [];
    for (const event of wallet.pullEvents() as WalletDomainEvent[]) {
      const reason = "reason" in event ? event.reason : undefined;
      const correlationId =
        "correlationId" in event ? event.correlationId : undefined;
      const amountCents = "amountCents" in event ? event.amountCents : 0n;
      stream.push({ event, reason, correlationId, amountCents });
    }
    this.events.set(wallet.id, stream);
  }
}

const PLAYER = "11111111-1111-4111-8111-111111111111";

function debitMsg(
  betId: string,
  playerId: string,
  amountCents: number,
  messageId = randomUUID(),
): IntegrationMessage<"DebitFunds"> {
  return {
    messageId,
    type: "DebitFunds",
    occurredAt: new Date().toISOString(),
    payload: { betId, roundId: randomUUID(), playerId, amountCents },
  };
}

describe("WalletSagaService.onDebitFunds", () => {
  it("debita e emite FundsDebited quando há saldo", async () => {
    const repo = new FakeWalletRepository();
    repo.seed(PLAYER, 10_000n);
    const saga = new WalletSagaService(repo);

    await saga.onDebitFunds(debitMsg(randomUUID(), PLAYER, 2_500));

    expect(repo.outbox).toHaveLength(1);
    expect(repo.outbox[0].type).toBe("FundsDebited");
    expect(repo.balanceOf(PLAYER)).toBe(7_500n);
  });

  it("rejeita (FundsDebitRejected) e mantém o saldo quando falta saldo", async () => {
    const repo = new FakeWalletRepository();
    repo.seed(PLAYER, 1_000n);
    const saga = new WalletSagaService(repo);

    await saga.onDebitFunds(debitMsg(randomUUID(), PLAYER, 5_000));

    expect(repo.outbox).toHaveLength(1);
    expect(repo.outbox[0].type).toBe("FundsDebitRejected");
    expect(repo.balanceOf(PLAYER)).toBe(1_000n);
  });

  it("é idempotente: a mesma mensagem reentregue não debita nem emite de novo", async () => {
    const repo = new FakeWalletRepository();
    repo.seed(PLAYER, 10_000n);
    const saga = new WalletSagaService(repo);
    const msg = debitMsg(randomUUID(), PLAYER, 2_500);

    await saga.onDebitFunds(msg);
    await saga.onDebitFunds(msg); // reentrega

    expect(repo.outbox).toHaveLength(1);
    expect(repo.balanceOf(PLAYER)).toBe(7_500n);
  });

  it("rejeita débito de carteira inexistente (mantém a saga viva)", async () => {
    const repo = new FakeWalletRepository();
    const saga = new WalletSagaService(repo);

    await saga.onDebitFunds(debitMsg(randomUUID(), PLAYER, 2_500));

    expect(repo.outbox).toHaveLength(1);
    expect(repo.outbox[0].type).toBe("FundsDebitRejected");
  });
});
