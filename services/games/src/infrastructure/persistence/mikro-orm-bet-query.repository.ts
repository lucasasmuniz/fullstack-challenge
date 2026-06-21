import { Injectable } from "@nestjs/common";
import { EntityManager } from "@mikro-orm/postgresql";
import type {
  BetQueryRepository,
  BetView,
} from "../../application/bet-query.repository";
import { BetEntity } from "./bet.entity";
import { toBetStatus } from "./mikro-orm-bet.repository";

/**
 * Adapter de leitura das apostas (lado de query do CQRS) — projeta `BetEntity` em `BetView`
 * sem hidratar o agregado. Separado do `MikroOrmBetRepository` (escrita/saga), ADR 0012.
 */
@Injectable()
export class MikroOrmBetQueryRepository implements BetQueryRepository {
  constructor(private readonly em: EntityManager) {}

  async findByPlayer(
    playerId: string,
    limit: number,
    offset: number,
  ): Promise<BetView[]> {
    const rows = await this.em
      .fork()
      .find(
        BetEntity,
        { playerId },
        { orderBy: { placedAt: "desc" }, limit, offset },
      );
    return rows.map(toBetView);
  }
}

function toBetView(e: BetEntity): BetView {
  return {
    id: e.id,
    roundId: e.roundId,
    username: e.username,
    amountCents: e.amountCents,
    status: toBetStatus(e.status),
    autoCashoutTargetX100: e.autoCashoutTargetX100,
    cashoutMultiplierX100: e.cashoutMultiplierX100,
    payoutCents: e.payoutCents,
    placedAt: e.placedAt,
    resolvedAt: e.resolvedAt,
  };
}
