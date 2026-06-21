import {
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Query,
} from "@nestjs/common";
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from "@nestjs/swagger";
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
@ApiTags("rounds")
@Controller("rounds")
export class RoundsController {
  constructor(
    private readonly query: RoundQueryService,
    @Inject(ENV) private readonly env: GamesEnv,
  ) {}

  @Public()
  @Get("current")
  @ApiOperation({
    summary: "Estado da rodada atual (público)",
    description:
      "Não expõe crashPoint nem serverSeed antes do crash. O cliente computa o multiplicador " +
      "pela curva a partir de startedAt + growthRate. `null` se não há rodada.",
  })
  @ApiResponse({ status: 200, description: "Rodada atual (ou null)." })
  async current(): Promise<CurrentRoundDto | null> {
    const round = await this.query.getCurrent();
    return round ? toCurrentRoundDto(round, this.env.CRASH_GROWTH_RATE) : null;
  }

  @Public()
  @Get("history")
  @ApiOperation({ summary: "Histórico paginado de rodadas crashadas (público)" })
  @ApiResponse({ status: 200, description: "Rodadas (mais recentes primeiro) com dados de verificação." })
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
  @ApiOperation({
    summary: "Dados de verificação provably fair de uma rodada (público)",
    description:
      "Recomputa commitment + crash point e o elo da hash chain. Disponível só após o crash " +
      "(seed revelada).",
  })
  @ApiParam({ name: "id", description: "UUID da rodada", format: "uuid" })
  @ApiResponse({ status: 200, description: "Verificação (isValid, recomputado, elo da cadeia)." })
  @ApiResponse({ status: 400, description: "id não é UUID." })
  @ApiResponse({ status: 404, description: "Rodada inexistente ou ainda não revelada." })
  async verify(@Param("id") id: string): Promise<VerifyRoundDto> {
    const roundId = parseOrBadRequest(roundIdParamSchema, id);
    const result = await this.query.verify(roundId);
    if (!result) {
      throw new NotFoundException("Rodada não encontrada ou ainda não revelada");
    }
    return toVerifyRoundDto(result);
  }
}
