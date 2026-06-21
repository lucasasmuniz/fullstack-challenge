import {
  BigIntType,
  Entity,
  Index,
  PrimaryKey,
  Property,
  Unique,
} from "@mikro-orm/core";

/**
 * `bet` — estado persistido da aposta (agregado separado do `round`; referencia
 * a rodada só por `round_id`). `version` dá concorrência otimista (anti dupla-liquidação,
 * 2ª linha). `UNIQUE(round_id, player_id)` impõe no banco a invariante cross-aggregate
 * "1 aposta/jogador/rodada". Dinheiro em `bigint` (centavos), sem float. `!` é idiomático
 * em entidade ORM (o data mapper hidrata sem chamar construtor).
 */
@Entity({ tableName: "bet" })
@Unique({ properties: ["roundId", "playerId"] })
export class BetEntity {
  @PrimaryKey({ type: "uuid" })
  id!: string;

  @Index()
  @Property({ type: "uuid" })
  roundId!: string;

  @Index()
  @Property({ type: "uuid" })
  playerId!: string;

  @Property({ type: "string" })
  username!: string;

  @Property({ type: new BigIntType("bigint") })
  amountCents!: bigint;

  @Property({ type: "string" })
  status!: string;

  @Property({ type: "integer", nullable: true })
  autoCashoutTargetX100!: number | null;

  @Property({ type: "integer", nullable: true })
  cashoutMultiplierX100!: number | null;

  @Property({ type: new BigIntType("bigint"), nullable: true })
  payoutCents!: bigint | null;

  @Property({ type: "integer" })
  version!: number;

  @Property({ type: "datetime" })
  placedAt!: Date;

  @Property({ type: "datetime", nullable: true })
  confirmedAt!: Date | null;

  @Property({ type: "datetime", nullable: true })
  resolvedAt!: Date | null;

  @Property({ type: "datetime" })
  createdAt: Date = new Date();
}
