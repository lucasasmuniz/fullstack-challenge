import { Entity, Index, PrimaryKey, Property, Unique } from "@mikro-orm/core";

/**
 * `round` — estado persistido da rodada (CQRS state-stored; a fonte da verdade é o estado,
 * não eventos). `server_seed` fica server-side (a API nunca o expõe antes do crash).
 * `version` dá concorrência otimista (fencing: um líder obsoleto falha o UPDATE
 * condicional). Tipos explícitos em toda coluna (robustez sob Bun). `!` é idiomático em
 * entidade ORM (o data mapper hidrata sem chamar o construtor).
 */
@Entity({ tableName: "round" })
export class RoundEntity {
  @PrimaryKey({ type: "uuid" })
  id!: string;

  @Unique()
  @Property({ type: "integer" })
  roundNumber!: number;

  @Index()
  @Property({ type: "string" })
  status!: string;

  @Property({ type: "integer" })
  crashPointX100!: number;

  @Property({ type: "text" })
  serverSeedHash!: string;

  @Property({ type: "text" })
  serverSeed!: string;

  @Property({ type: "text" })
  publicSeed!: string;

  @Property({ type: "uuid" })
  chainId!: string;

  @Property({ type: "integer" })
  chainIndex!: number;

  @Property({ type: "integer" })
  version!: number;

  @Property({ type: "datetime" })
  bettingEndsAt!: Date;

  @Property({ type: "datetime", nullable: true })
  startedAt!: Date | null;

  @Property({ type: "datetime", nullable: true })
  crashedAt!: Date | null;

  @Property({ type: "datetime", nullable: true })
  settledAt!: Date | null;

  @Property({ type: "datetime" })
  createdAt: Date = new Date();
}
