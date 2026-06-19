import {
  BigIntType,
  Entity,
  Index,
  PrimaryKey,
  Property,
  Unique,
} from "@mikro-orm/core";

/**
 * `wallet_event` — store append-only do ledger (fonte da verdade). Os nomes de
 * coluna saem em snake_case pela UnderscoreNamingStrategy do preset. Tipos
 * **explícitos** em toda coluna (robustez sob Bun, sem depender de reflect-metadata).
 *
 * - `UNIQUE(wallet_id, version)` → concorrência otimista (1 evento por posição).
 * - `UNIQUE(wallet_id, reason, correlation_id)` → idempotência **escopada por
 *   carteira**: o `Idempotency-Key` do cliente só dedup dentro da própria carteira,
 *   nunca entre jogadores (nulos no `WalletCreated`; Postgres trata nulos como
 *   distintos).
 */
@Entity({ tableName: "wallet_event" })
@Unique({ properties: ["walletId", "version"] })
@Unique({ properties: ["walletId", "reason", "correlationId"] })
export class WalletEventEntity {
  @PrimaryKey({ type: "uuid" })
  id!: string;

  @Index()
  @Property({ type: "uuid" })
  walletId!: string;

  @Property({ type: "integer" })
  version!: number;

  /** Nome do domain event: WalletCreated | FundsCredited | FundsDebited. */
  @Property({ type: "string" })
  type!: string;

  @Property({ type: new BigIntType("bigint") })
  amountCents!: bigint;

  @Property({ type: "string", nullable: true })
  reason!: string | null;

  @Property({ type: "string", nullable: true })
  correlationId!: string | null;

  @Property({ type: "json", nullable: true })
  metadata!: Record<string, unknown> | null;

  @Property({ type: "datetime" })
  occurredAt!: Date;
}
