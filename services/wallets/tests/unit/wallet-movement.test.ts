import { describe, it, expect } from "bun:test";
import { randomUUID } from "node:crypto";
import { UniqueConstraintViolationException } from "@mikro-orm/core";
import { Money } from "@crash-game/money";
import { WalletMovementService } from "../../src/application/wallet-movement.service";
import { DepositHandler } from "../../src/application/deposit.handler";
import { WithdrawHandler } from "../../src/application/withdraw.handler";
import type { WalletRepository } from "../../src/application/wallet.repository";
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

/**
 * Fake do WalletRepository, in-memory, determinístico. Reconstrói o agregado a cada
 * `findByPlayerId` (como o real faz pelo fold), valida a unicidade
 * (wallet_id, reason, correlation_id) e (wallet_id, version) e permite **injetar**
 * um conflito de version no próximo `save` (simula concorrência sem Postgres).
 */
class FakeWalletRepository implements WalletRepository {
  private events = new Map<string, StoredEvent[]>(); // walletId -> stream
  private players = new Map<string, string>(); // playerId -> walletId
  private failNextSaveWithVersionConflict = false;

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

  injectVersionConflictOnNextSave(): void {
    this.failNextSaveWithVersionConflict = true;
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

  save(wallet: Wallet): Promise<void> {
    if (this.failNextSaveWithVersionConflict) {
      this.failNextSaveWithVersionConflict = false;
      // Simula outra transação que gravou a próxima version antes.
      return Promise.reject(
        new UniqueConstraintViolationException(
          new Error("duplicate key (wallet_id, version)"),
        ),
      );
    }
    this.persist(wallet);
    return Promise.resolve();
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

  // Saga (Etapa 5): não exercitado por estes testes de deposit/withdraw (REST).
  appendSagaResult(): Promise<void> {
    return Promise.reject(new Error("appendSagaResult não usado nestes testes"));
  }

  wasMessageProcessed(): Promise<boolean> {
    return Promise.resolve(false);
  }

  private persist(wallet: Wallet): void {
    const stream = this.events.get(wallet.id) ?? [];
    for (const event of wallet.pullEvents() as WalletDomainEvent[]) {
      const reason = "reason" in event ? event.reason : undefined;
      const correlationId =
        "correlationId" in event ? event.correlationId : undefined;
      const amountCents = "amountCents" in event ? event.amountCents : 0n;
      // valida (wallet_id, version)
      if (stream.some((s) => s.event.version === event.version)) {
        throw new UniqueConstraintViolationException(
          new Error("duplicate version"),
        );
      }
      // valida (wallet_id, reason, correlation_id)
      if (
        reason !== undefined &&
        stream.some(
          (s) => s.reason === reason && s.correlationId === correlationId,
        )
      ) {
        throw new UniqueConstraintViolationException(
          new Error("duplicate (reason, correlation_id)"),
        );
      }
      stream.push({ event, reason, correlationId, amountCents });
    }
    this.events.set(wallet.id, stream);
  }
}

function setup() {
  const repo = new FakeWalletRepository();
  const movements = new WalletMovementService(repo);
  return {
    repo,
    deposit: new DepositHandler(movements),
    withdraw: new WithdrawHandler(movements),
  };
}

describe("DepositHandler (fake repo)", () => {
  it("credita e devolve o novo saldo", async () => {
    const { repo, deposit } = setup();
    repo.seed("p1", 0n);
    const res = await deposit.execute("p1", 1000n, randomUUID());
    expect(res.isOk).toBe(true);
    expect(res.unwrap().balanceCents).toBe(1000n);
  });

  it("retry com a mesma key não credita de novo (idempotente)", async () => {
    const { repo, deposit } = setup();
    repo.seed("p1", 0n);
    const key = randomUUID();
    await deposit.execute("p1", 1000n, key);
    const again = await deposit.execute("p1", 1000n, key);
    expect(again.isOk).toBe(true);
    expect(again.unwrap().balanceCents).toBe(1000n);
  });

  it("mesma key com valor diferente → IdempotencyKeyConflict", async () => {
    const { repo, deposit } = setup();
    repo.seed("p1", 0n);
    const key = randomUUID();
    await deposit.execute("p1", 1000n, key);
    const conflict = await deposit.execute("p1", 9999n, key);
    expect(conflict.isFail).toBe(true);
    expect(conflict.unwrapError().code).toBe("IDEMPOTENCY_KEY_CONFLICT");
  });

  it("carteira inexistente → WalletNotFound", async () => {
    const { deposit } = setup();
    const res = await deposit.execute("ghost", 1000n, randomUUID());
    expect(res.unwrapError().code).toBe("WALLET_NOT_FOUND");
  });

  it("conflito de version é reprocessado (retry), não vira falso sucesso", async () => {
    const { repo, deposit } = setup();
    repo.seed("p1", 0n);
    repo.injectVersionConflictOnNextSave(); // 1ª tentativa falha; loop recarrega e reaplica
    const res = await deposit.execute("p1", 700n, randomUUID());
    expect(res.isOk).toBe(true);
    expect(res.unwrap().balanceCents).toBe(700n);
  });
});

describe("WithdrawHandler (fake repo)", () => {
  it("debita quando há saldo", async () => {
    const { repo, withdraw } = setup();
    repo.seed("p1", 1000n);
    const res = await withdraw.execute("p1", 400n, randomUUID());
    expect(res.isOk).toBe(true);
    expect(res.unwrap().balanceCents).toBe(600n);
  });

  it("saldo insuficiente → InsufficientFunds (sem mutar)", async () => {
    const { repo, withdraw } = setup();
    repo.seed("p1", 100n);
    const res = await withdraw.execute("p1", 500n, randomUUID());
    expect(res.isFail).toBe(true);
    expect(res.unwrapError().code).toBe("INSUFFICIENT_FUNDS");
  });
});
