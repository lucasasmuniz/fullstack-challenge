import { Injectable } from "@nestjs/common";
import { EntityManager } from "@mikro-orm/postgresql";
import { BetStatus } from "../../domain";
import type {
  LeaderboardEntry,
  LeaderboardQueryRepository,
} from "../../application/leaderboard-query.repository";

/** Linha crua da agregação (Postgres devolve bigint/count como string). */
interface RawRow {
  playerId: string;
  username: string;
  profitCents: string;
  betsCount: string;
}

/**
 * Adapter de leitura do leaderboard. Agrega direto no banco (sem hidratar agregados):
 *
 *   SUM(COALESCE(payout_cents, 0) − amount_cents)  -- lucro líquido (LOST tem payout NULL → −aposta)
 *   WHERE status IN ('CASHED_OUT','LOST') AND resolved_at >= ?
 *   GROUP BY player_id, username  ORDER BY lucro DESC  LIMIT ?
 *
 * O **covering index** `(status, resolved_at) INCLUDE (player_id, username, payout_cents, amount_cents)`
 * permite um **Index-Only Scan** (sem heap fetch).
 */
@Injectable()
export class MikroOrmLeaderboardQueryRepository
  implements LeaderboardQueryRepository
{
  constructor(private readonly em: EntityManager) {}

  async topByProfit(since: Date, limit: number): Promise<LeaderboardEntry[]> {
    const rows = await this.em.getConnection().execute<RawRow[]>(
      `select "player_id" as "playerId",
              "username",
              sum(coalesce("payout_cents", 0) - "amount_cents") as "profitCents",
              count(*) as "betsCount"
       from "bet"
       where "status" in (?, ?) and "resolved_at" >= ?
       group by "player_id", "username"
       order by "profitCents" desc
       limit ?`,
      [BetStatus.CASHED_OUT, BetStatus.LOST, since, limit],
    );
    return rows.map((r) => ({
      playerId: r.playerId,
      username: r.username,
      profitCents: Number(r.profitCents),
      betsCount: Number(r.betsCount),
    }));
  }
}
