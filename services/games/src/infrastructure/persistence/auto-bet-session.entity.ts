import { BigIntType, Entity, Index, PrimaryKey, Property } from "@mikro-orm/core";

/**
 * `auto_bet_session` — estado persistido do Process Manager de auto-bet (state-stored).
 * Dinheiro em `bigint` (centavos), sem float; `net_result_cents` é **assinado** (P&L). No
 * máx. **uma** sessão `ACTIVE` por jogador → índice único **parcial** (`player_id` where
 * status='ACTIVE'), criado na migration. `version` dá concorrência otimista (corrida
 * REST-stop × reconcile-do-líder). `!` é idiomático em entidade ORM (hidratação sem construtor).
 */
@Entity({ tableName: "auto_bet_session" })
export class AutoBetSessionEntity {
  @PrimaryKey({ type: "uuid" })
  id!: string;

  @Index()
  @Property({ type: "uuid" })
  playerId!: string;

  @Property({ type: "string" })
  username!: string;

  @Index()
  @Property({ type: "string" })
  status!: string;

  @Property({ type: "string" })
  strategy!: string;

  @Property({ type: new BigIntType("bigint") })
  baseAmountCents!: bigint;

  @Property({ type: new BigIntType("bigint") })
  nextAmountCents!: bigint;

  @Property({ type: "integer" })
  autoCashoutTargetX100!: number;

  @Property({ type: new BigIntType("bigint") })
  stopLossCents!: bigint;

  @Property({ type: new BigIntType("bigint") })
  budgetCents!: bigint;

  @Property({ type: new BigIntType("bigint"), nullable: true })
  stopWinCents!: bigint | null;

  @Property({ type: "integer", nullable: true })
  maxRounds!: number | null;

  @Property({ type: "integer" })
  roundsPlayed!: number;

  @Property({ type: new BigIntType("bigint") })
  netResultCents!: bigint;

  @Property({ type: new BigIntType("bigint") })
  totalWageredCents!: bigint;

  @Property({ type: "uuid", nullable: true })
  currentRoundId!: string | null;

  @Property({ type: "uuid", nullable: true })
  currentBetId!: string | null;

  @Property({ type: "uuid", nullable: true })
  lastProcessedRoundId!: string | null;

  @Property({ type: "string", nullable: true })
  completionReason!: string | null;

  @Property({ type: "integer" })
  version!: number;

  @Property({ type: "datetime" })
  createdAt!: Date;

  @Property({ type: "datetime" })
  updatedAt!: Date;
}
