import { Inject, Injectable, Logger } from "@nestjs/common";
import { ENV } from "@crash-game/nestjs-kit";
import type { GamesEnv } from "../infrastructure/config/env.schema";
import {
  LEADERBOARD_QUERY_REPOSITORY,
  type LeaderboardEntry,
  type LeaderboardQueryRepository,
} from "./leaderboard-query.repository";
import { VALKEY, type ValkeyPort } from "./valkey.port";

export type LeaderboardPeriod = "24h" | "week";

const WINDOW_MS: Record<LeaderboardPeriod, number> = {
  "24h": 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
};

/**
 * `LeaderboardService` — top jogadores por lucro (24h/semana). Lê com **cache Valkey**
 * (TTL curto): coerente o suficiente nessa escala, sem job de refresh. Degrada com elegância —
 * Valkey fora do ar → consulta direto o banco (nunca derruba a rota).
 */
@Injectable()
export class LeaderboardService {
  private readonly logger = new Logger(LeaderboardService.name);

  constructor(
    @Inject(LEADERBOARD_QUERY_REPOSITORY)
    private readonly repo: LeaderboardQueryRepository,
    @Inject(VALKEY) private readonly valkey: ValkeyPort,
    @Inject(ENV) private readonly env: GamesEnv,
  ) {}

  async getTop(
    period: LeaderboardPeriod,
    limit: number,
  ): Promise<LeaderboardEntry[]> {
    const key = `leaderboard:${period}:${limit.toString()}`;

    const cached = await this.readCache(key);
    if (cached) {
      return cached;
    }

    const since = new Date(Date.now() - WINDOW_MS[period]);
    const entries = await this.repo.topByProfit(since, limit);
    await this.writeCache(key, entries);
    return entries;
  }

  private async readCache(key: string): Promise<LeaderboardEntry[] | null> {
    try {
      const raw = await this.valkey.get(key);
      return raw ? (JSON.parse(raw) as LeaderboardEntry[]) : null;
    } catch (err) {
      this.logger.warn(`Cache do leaderboard indisponível (read): ${asMessage(err)}`);
      return null;
    }
  }

  private async writeCache(key: string, entries: LeaderboardEntry[]): Promise<void> {
    try {
      await this.valkey.setPx(
        key,
        JSON.stringify(entries),
        this.env.LEADERBOARD_CACHE_TTL_MS,
      );
    } catch (err) {
      this.logger.warn(`Cache do leaderboard indisponível (write): ${asMessage(err)}`);
    }
  }
}

function asMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
