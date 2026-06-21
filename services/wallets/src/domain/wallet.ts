import { AggregateRoot, Result } from "@crash-game/domain-kit";
import { Money } from "@crash-game/money";
import {
  FundsCredited,
  FundsDebited,
  WalletCreated,
  type WalletDomainEvent,
} from "./wallet-events";
import { InsufficientFundsError, InvalidAmountError } from "./wallet-errors";
import type { WalletReason } from "./wallet-reason";

/**
 * Agregado event-sourced: o estado (saldo/version) é derivado dos eventos do ledger; nenhuma
 * mutação ocorre sem um evento. Invariante central: saldo nunca negativo (no domínio + `CHECK` no
 * banco). Identidade técnica `walletId`; identidade de negócio `playerId` (1 carteira por jogador).
 */
export class Wallet extends AggregateRoot<string> {
  private _playerId: string;
  private _currency: string;
  private _balance: Money = Money.zero();
  private _version = 0;

  private constructor(id: string, playerId: string, currency: string) {
    super(id);
    this._playerId = playerId;
    this._currency = currency;
  }

  get playerId(): string {
    return this._playerId;
  }
  get currency(): string {
    return this._currency;
  }
  get balance(): Money {
    return this._balance;
  }
  get version(): number {
    return this._version;
  }

  static create(props: {
    walletId: string;
    playerId: string;
    currency: string;
  }): Result<Wallet, never> {
    const wallet = new Wallet(props.walletId, props.playerId, props.currency);
    wallet.applyAndRecord(
      new WalletCreated(props.walletId, props.playerId, props.currency, 1),
    );
    return Result.ok(wallet);
  }

  static rebuild(events: readonly WalletDomainEvent[]): Wallet {
    const first = events[0];
    if (!(first instanceof WalletCreated)) {
      throw new Error("Stream de wallet deve começar com WalletCreated");
    }
    const wallet = new Wallet(first.walletId, first.playerId, first.currency);
    let expectedVersion = 1;
    for (const event of events) {
      if (event.version !== expectedVersion) {
        throw new Error(
          `Stream inconsistente: esperava version ${expectedVersion}, veio ${event.version}`,
        );
      }
      wallet.apply(event);
      expectedVersion += 1;
    }
    return wallet;
  }

  credit(
    amount: Money,
    reason: WalletReason,
    correlationId: string,
  ): Result<void, InvalidAmountError> {
    if (amount.isZero()) {
      return Result.fail(new InvalidAmountError());
    }
    this.applyAndRecord(
      new FundsCredited(
        this.id,
        this._version + 1,
        amount.toCents(),
        reason,
        correlationId,
      ),
    );
    return Result.ok(undefined);
  }

  debit(
    amount: Money,
    reason: WalletReason,
    correlationId: string,
  ): Result<void, InsufficientFundsError | InvalidAmountError> {
    if (amount.isZero()) {
      return Result.fail(new InvalidAmountError());
    }
    if (!this._balance.isGreaterThanOrEqual(amount)) {
      return Result.fail(new InsufficientFundsError());
    }
    this.applyAndRecord(
      new FundsDebited(
        this.id,
        this._version + 1,
        amount.toCents(),
        reason,
        correlationId,
      ),
    );
    return Result.ok(undefined);
  }

  private apply(event: WalletDomainEvent): void {
    switch (event.eventName) {
      case "WalletCreated":
        this._balance = Money.zero();
        break;
      case "FundsCredited":
        this._balance = this._balance.add(Money.fromCents(event.amountCents));
        break;
      case "FundsDebited":
        this._balance = this._balance.subtract(
          Money.fromCents(event.amountCents),
        );
        break;
    }
    this._version = event.version;
  }

  private applyAndRecord(event: WalletDomainEvent): void {
    this.apply(event);
    this.addEvent(event);
  }
}
