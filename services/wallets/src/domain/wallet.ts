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
 * Wallet — agregado **event-sourced**. O estado (saldo/version) é derivado dos
 * eventos do ledger; nenhuma mutação acontece sem um evento correspondente. A
 * invariante central é **saldo nunca negativo** (garantida aqui no domínio e,
 * em defesa em profundidade, por `CHECK` no banco).
 *
 * Identidade do agregado: `walletId` (uuid). A identidade de negócio é o
 * `playerId` (= `sub` do JWT), com 1 carteira por jogador.
 */
export class Wallet extends AggregateRoot<string> {
  private _playerId: string;
  private _currency: string;
  private _balance: Money = Money.zero();
  private _version = 0;

  // Construtor privado recebe a identidade (sem `!`): toda construção passa por
  // `create`/`rebuild`, que sempre têm `playerId`/`currency` (params ou 1º evento).
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

  /** Cria uma carteira nova (saldo zero), emitindo `WalletCreated` (version 1). */
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

  /**
   * Reconstrói o agregado a partir do stream de eventos (fold) — sem novos eventos.
   * Valida a **continuidade das versões** (1, 2, 3, …): gap, duplicata ou reordenação
   * fazem falhar fechado, em vez de produzir um saldo silenciosamente errado.
   */
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

  /** Aplica o efeito do evento no estado (usado tanto no fold quanto nas mutações). */
  private apply(event: WalletDomainEvent): void {
    switch (event.eventName) {
      case "WalletCreated":
        // Identidade (playerId/currency) já vem do construtor; aqui só o saldo inicial.
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

  /** Aplica e registra o evento como novo (a ser persistido pelo repositório). */
  private applyAndRecord(event: WalletDomainEvent): void {
    this.apply(event);
    this.addEvent(event);
  }
}
