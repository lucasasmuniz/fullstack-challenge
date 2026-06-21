import { Controller, Get, Query } from "@nestjs/common";
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from "@nestjs/swagger";
import { Public } from "@crash-game/nestjs-kit";
import { LeaderboardService } from "../../application/leaderboard.service";
import {
  toLeaderboardDto,
  type LeaderboardDto,
} from "../dtos/leaderboard.dto";
import { leaderboardPeriodSchema, parseOrBadRequest } from "../http/validation";
import { parsePagination } from "../http/pagination";

/**
 * Leaderboard — top jogadores por lucro líquido (24h/semana). Público (`@Public()`):
 * qualquer um vê o ranking. Kong faz strip de `/games` → `/leaderboard`.
 */
@ApiTags("leaderboard")
@Controller("leaderboard")
export class LeaderboardController {
  constructor(private readonly leaderboard: LeaderboardService) {}

  @Public()
  @Get()
  @ApiOperation({
    summary: "Top jogadores por lucro líquido (24h ou semana)",
    description:
      "Agrega as apostas resolvidas (CASHED_OUT/LOST) na janela e ordena por lucro. Cache curto (Valkey).",
  })
  @ApiQuery({ name: "period", required: false, enum: ["24h", "week"], description: "Default 24h." })
  @ApiQuery({ name: "limit", required: false, description: "1..50 (default 20)." })
  @ApiResponse({ status: 200, description: "Ranking (lista ordenada por lucro)." })
  async top(
    @Query("period") period?: string,
    @Query("limit") limit?: string,
  ): Promise<LeaderboardDto> {
    const validPeriod = parseOrBadRequest(leaderboardPeriodSchema, period ?? "24h");
    const { limit: lim } = parsePagination(limit, undefined);
    const entries = await this.leaderboard.getTop(validPeriod, lim);
    return toLeaderboardDto(validPeriod, entries);
  }
}
