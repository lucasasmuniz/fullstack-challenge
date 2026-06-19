import { describe, it, expect } from "bun:test";
import { Money } from "@crash-game/money";
import { Wallet } from "../../src/domain/wallet";
import {
  FundsCredited,
  FundsDebited,
  WalletCreated,
  type WalletDomainEvent,
} from "../../src/domain/wallet-events";
import {
  InsufficientFundsError,
  InvalidAmountError,
} from "../../src/domain/wallet-errors";

const PLAYER = "player-uuid";

function newWallet(): Wallet {
  return Wallet.create({
    walletId: "w-1",
    playerId: PLAYER,
    currency: "BRL",
  }).unwrap();
}

describe("Wallet.create", () => {
  it("nasce com saldo zero, version 1 e emite WalletCreated", () => {
    const wallet = newWallet();
    expect(wallet.balance.toCents()).toBe(0n);
    expect(wallet.version).toBe(1);
    expect(wallet.playerId).toBe(PLAYER);
    expect(wallet.currency).toBe("BRL");

    const events = wallet.pullEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toBeInstanceOf(WalletCreated);
  });
});

describe("Wallet.credit", () => {
  it("credita, sobe saldo+version e emite FundsCredited", () => {
    const wallet = newWallet();
    wallet.pullEvents(); // drena o WalletCreated

    const result = wallet.credit(Money.fromCents(100n), "deposit", "c1");
    expect(result.isOk).toBe(true);
    expect(wallet.balance.toCents()).toBe(100n);
    expect(wallet.version).toBe(2);

    const events = wallet.pullEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toBeInstanceOf(FundsCredited);
  });

  it("rejeita crédito de valor zero", () => {
    const wallet = newWallet();
    const result = wallet.credit(Money.zero(), "deposit", "c1");
    expect(result.isFail).toBe(true);
    expect(result.unwrapError()).toBeInstanceOf(InvalidAmountError);
  });
});

describe("Wallet.debit", () => {
  it("debita quando há saldo", () => {
    const wallet = newWallet();
    wallet.credit(Money.fromCents(100n), "deposit", "c1");

    const result = wallet.debit(Money.fromCents(40n), "withdrawal", "d1");
    expect(result.isOk).toBe(true);
    expect(wallet.balance.toCents()).toBe(60n);
    expect(wallet.version).toBe(3);
  });

  it("rejeita débito acima do saldo (InsufficientFunds) sem mutar estado", () => {
    const wallet = newWallet();
    wallet.credit(Money.fromCents(30n), "deposit", "c1");

    const result = wallet.debit(Money.fromCents(100n), "withdrawal", "d1");
    expect(result.isFail).toBe(true);
    expect(result.unwrapError()).toBeInstanceOf(InsufficientFundsError);
    expect(wallet.balance.toCents()).toBe(30n);
    expect(wallet.version).toBe(2);
  });

  it("permite zerar exatamente o saldo (invariante >= 0)", () => {
    const wallet = newWallet();
    wallet.credit(Money.fromCents(50n), "deposit", "c1");
    const result = wallet.debit(Money.fromCents(50n), "withdrawal", "d1");
    expect(result.isOk).toBe(true);
    expect(wallet.balance.toCents()).toBe(0n);
  });

  it("rejeita débito de valor zero", () => {
    const wallet = newWallet();
    const result = wallet.debit(Money.zero(), "withdrawal", "d1");
    expect(result.unwrapError()).toBeInstanceOf(InvalidAmountError);
  });
});

describe("Wallet.rebuild (fold do ledger)", () => {
  it("reconstrói saldo e version a partir dos eventos", () => {
    const events: WalletDomainEvent[] = [
      new WalletCreated("w-1", PLAYER, "BRL", 1),
      new FundsCredited("w-1", 2, 100000n, "initial", "seed"),
      new FundsDebited("w-1", 3, 25000n, "withdrawal", "d1"),
      new FundsCredited("w-1", 4, 5000n, "deposit", "c1"),
    ];

    const wallet = Wallet.rebuild(events);

    expect(wallet.balance.toCents()).toBe(80000n);
    expect(wallet.version).toBe(4);
    expect(wallet.playerId).toBe(PLAYER);
    // rebuild não deixa eventos pendentes
    expect(wallet.pullEvents()).toHaveLength(0);
  });

  it("falha se o stream não começa com WalletCreated", () => {
    expect(() =>
      Wallet.rebuild([new FundsCredited("w-1", 1, 100n, "deposit", "c1")]),
    ).toThrow();
  });

  it("falha fechado em gap de version (stream inconsistente)", () => {
    const events: WalletDomainEvent[] = [
      new WalletCreated("w-1", PLAYER, "BRL", 1),
      // pula a version 2 → gap
      new FundsCredited("w-1", 3, 100n, "deposit", "c1"),
    ];
    expect(() => Wallet.rebuild(events)).toThrow(/version/);
  });

  it("falha fechado em duplicata de version", () => {
    const events: WalletDomainEvent[] = [
      new WalletCreated("w-1", PLAYER, "BRL", 1),
      new FundsCredited("w-1", 2, 100n, "deposit", "c1"),
      new FundsCredited("w-1", 2, 100n, "deposit", "c2"),
    ];
    expect(() => Wallet.rebuild(events)).toThrow(/version/);
  });
});
