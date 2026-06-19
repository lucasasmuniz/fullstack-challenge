import { DomainEvent } from "@crash-game/domain-kit";
import type { WalletReason } from "./wallet-reason";

/**
 * Eventos do ledger da Wallet — **fonte da verdade** (event sourcing). Cada evento
 * vira uma linha append-only em `wallet_event` e, ao ser aplicado, atualiza a
 * projeção de saldo. `version` é a posição do evento no stream do agregado
 * (`UNIQUE(wallet_id, version)` → concorrência otimista).
 */

export class WalletCreated extends DomainEvent {
  readonly eventName = "WalletCreated";
  constructor(
    readonly walletId: string,
    readonly playerId: string,
    readonly currency: string,
    readonly version: number,
    occurredAt?: Date,
  ) {
    super(occurredAt);
  }
}

export class FundsCredited extends DomainEvent {
  readonly eventName = "FundsCredited";
  constructor(
    readonly walletId: string,
    readonly version: number,
    readonly amountCents: bigint,
    readonly reason: WalletReason,
    readonly correlationId: string,
    occurredAt?: Date,
  ) {
    super(occurredAt);
  }
}

export class FundsDebited extends DomainEvent {
  readonly eventName = "FundsDebited";
  constructor(
    readonly walletId: string,
    readonly version: number,
    readonly amountCents: bigint,
    readonly reason: WalletReason,
    readonly correlationId: string,
    occurredAt?: Date,
  ) {
    super(occurredAt);
  }
}

export type WalletDomainEvent = WalletCreated | FundsCredited | FundsDebited;
