import {
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Query,
} from "@nestjs/common";
import { ENV, Public } from "@crash-game/nestjs-kit";
import { RoundQueryService } from "../../application/round-query.service";
import type { GamesEnv } from "../../infrastructure/config/env.schema";
import {
  toCurrentRoundDto,
  toHistoryRoundDto,
  toVerifyRoundDto,
  type CurrentRoundDto,
  type HistoryRoundDto,
  type VerifyRoundDto,
} from "../dtos/round.dto";
import { parseOrBadRequest, roundIdParamSchema } from "../http/validation";
import { parsePagination } from "../http/pagination";

/**
 * Leituras públicas de rodada (Kong faz strip de `/games` → rotas internas `/rounds/*`).
 * Anônimo assiste o jogo (R: leituras do Game são públicas). Nada de segredo da rodada
 * corrente sai por aqui (ver `CurrentRoundDto`).
 */
@Controller("rounds")
export class RoundsController {
  constructor(
    private readonly query: RoundQueryService,
    @Inject(ENV) private readonly env: GamesEnv,
  ) {}

  @Public()
  @Get("current")
  async current(): Promise<CurrentRoundDto | null> {
    const round = await this.query.getCurrent();
    return round ? toCurrentRoundDto(round, this.env.CRASH_GROWTH_RATE) : null;
  }

  @Public()
  @Get("history")
  async history(
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ): Promise<{ items: HistoryRoundDto[]; limit: number; offset: number }> {
    const { limit: lim, offset: off } = parsePagination(limit, offset);
    const rounds = await this.query.getHistory(lim, off);
    return { items: rounds.map(toHistoryRoundDto), limit: lim, offset: off };
  }

  @Public()
  @Get(":id/verify")
  async verify(@Param("id") id: string): Promise<VerifyRoundDto> {
    const roundId = parseOrBadRequest(roundIdParamSchema, id);
    const result = await this.query.verify(roundId);
    if (!result) {
      throw new NotFoundException("Rodada não encontrada ou ainda não revelada");
    }
    return toVerifyRoundDto(result);
  }
}
