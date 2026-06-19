import { randomUUID } from "node:crypto";
import {
  FundsCredited,
  FundsDebited,
  WALLET_REASONS,
  WalletCreated,
  type WalletDomainEvent,
  type WalletReason,
} from "../../domain";
import type { WalletEventEntity } from "./wallet-event.entity";

/** Valida que um `reason` lido do banco é conhecido (falha fechado se corrompido). */
function parseReason(value: string | null): WalletReason {
  if (value !== null && (WALLET_REASONS as readonly string[]).includes(value)) {
    return value as WalletReason;
  }
  throw new Error(`Reason inválido no ledger: ${String(value)}`);
}

/** Forma persistível de um domain event (linha de `wallet_event`). */
export interface WalletEventRow {
  id: string;
  walletId: string;
  version: number;
  type: string;
  amountCents: bigint;
  reason: string | null;
  correlationId: string | null;
  metadata: Record<string, unknown> | null;
  occurredAt: Date;
}

/** Domain event → linha do event store. */
export function toRow(event: WalletDomainEvent): WalletEventRow {
  const base = {
    id: randomUUID(),
    walletId: event.walletId,
    version: event.version,
    type: event.eventName,
    occurredAt: event.occurredAt,
  };

  if (event instanceof WalletCreated) {
    return {
      ...base,
      amountCents: 0n,
      reason: null,
      correlationId: null,
      metadata: { playerId: event.playerId, currency: event.currency },
    };
  }

  // FundsCredited | FundsDebited
  return {
    ...base,
    amountCents: event.amountCents,
    reason: event.reason,
    correlationId: event.correlationId,
    metadata: null,
  };
}

/** Linha do event store → domain event (para o `fold` na reconstrução). */
export function toDomainEvent(row: WalletEventEntity): WalletDomainEvent {
  switch (row.type) {
    case "WalletCreated": {
      const meta = (row.metadata ?? {}) as {
        playerId?: string;
        currency?: string;
      };
      return new WalletCreated(
        row.walletId,
        meta.playerId ?? "",
        meta.currency ?? "",
        row.version,
        row.occurredAt,
      );
    }
    case "FundsCredited":
      return new FundsCredited(
        row.walletId,
        row.version,
        row.amountCents,
        parseReason(row.reason),
        row.correlationId ?? "",
        row.occurredAt,
      );
    case "FundsDebited":
      return new FundsDebited(
        row.walletId,
        row.version,
        row.amountCents,
        parseReason(row.reason),
        row.correlationId ?? "",
        row.occurredAt,
      );
    default:
      throw new Error(`Tipo de evento desconhecido no ledger: ${row.type}`);
  }
}
