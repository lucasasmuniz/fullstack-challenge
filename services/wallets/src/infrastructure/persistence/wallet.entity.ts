import {
  BigIntType,
  Check,
  Entity,
  PrimaryKey,
  Property,
  Unique,
} from "@mikro-orm/core";

/**
 * `wallet` — projeção de saldo (read model derivado do ledger), mantida na **mesma
 * transação** do append de eventos. `CHECK (balance_cents >= 0)` é a defesa em
 * profundidade da invariante "saldo nunca negativo" (a outra é o agregado). Tipos
 * explícitos em toda coluna (robustez sob Bun).
 */
@Entity({ tableName: "wallet" })
@Check({ expression: "balance_cents >= 0" })
export class WalletEntity {
  @PrimaryKey({ type: "uuid" })
  id!: string;

  @Unique()
  @Property({ type: "uuid" })
  playerId!: string;

  @Property({ type: new BigIntType("bigint") })
  balanceCents!: bigint;

  @Property({ type: "integer" })
  version!: number;

  @Property({ type: "string", length: 3 })
  currency!: string;

  @Property({ type: "datetime" })
  createdAt: Date = new Date();

  @Property({ type: "datetime", onUpdate: () => new Date() })
  updatedAt: Date = new Date();
}
