import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Query,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { CurrentUser, type AuthenticatedUser } from "@crash-game/nestjs-kit";
import { PlaceBetHandler } from "../../application/place-bet.handler";
import { CashoutHandler } from "../../application/cashout.handler";
import {
  BET_QUERY_REPOSITORY,
  type BetQueryRepository,
} from "../../application/bet-query.repository";
import {
  toBetHistoryDto,
  toCashedOutBetDto,
  toPlacedBetDto,
  type BetHistoryDto,
  type CashedOutBetDto,
  type PlacedBetDto,
} from "../dtos/bet.dto";
import { unwrapOrThrow } from "../http/domain-http";
import { parseOrBadRequest, placeBetBodySchema } from "../http/validation";
import { parsePagination } from "../http/pagination";

/**
 * Rotas de aposta (Kong faz strip de `/games` → `/bet`, `/bets/me`). Exigem auth (guard
 * global); o `player_id` vem **sempre** do `sub` do JWT, nunca do body. O débito acontece
 * via saga (SQS), nunca síncrono aqui.
 */
@ApiTags("bets")
@ApiBearerAuth("bearer")
@Controller()
export class BetsController {
  constructor(
    private readonly placeBet: PlaceBetHandler,
    private readonly cashout: CashoutHandler,
    @Inject(BET_QUERY_REPOSITORY) private readonly betQueries: BetQueryRepository,
  ) {}

  @Post("bet")
  @HttpCode(201)
  @ApiOperation({
    summary: "Fazer aposta na rodada atual (apenas na fase de apostas)",
    description:
      "Cria a aposta em PENDING_FUNDS e dispara o débito via saga SQS (→ CONFIRMED ou REJECTED, " +
      "por WebSocket). 1 aposta por jogador/rodada. O player vem do JWT, nunca do body.",
  })
  @ApiBody({
    schema: {
      type: "object",
      required: ["amountCents"],
      properties: {
        amountCents: {
          type: "integer",
          example: 2000,
          description: "Valor em centavos (mín. 100 / máx. 100000).",
        },
        autoCashoutTargetX100: {
          type: "integer",
          nullable: true,
          example: 250,
          description: "Alvo de auto-cashout ×100 (opcional; > 100).",
        },
      },
    },
  })
  @ApiResponse({ status: 201, description: "Aposta criada (PENDING_FUNDS)." })
  @ApiResponse({ status: 409, description: "Fora da fase de apostas ou aposta dupla." })
  @ApiResponse({ status: 422, description: "Valor fora do range permitido." })
  async place(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
  ): Promise<PlacedBetDto> {
    const { amountCents, autoCashoutTargetX100 } = parseOrBadRequest(
      placeBetBodySchema,
      body,
    );
    const result = await this.placeBet.execute(
      user.sub,
      user.username,
      BigInt(amountCents),
      autoCashoutTargetX100 ?? null,
    );
    return toPlacedBetDto(unwrapOrThrow(result));
  }

  @Post("bet/cashout")
  @HttpCode(200)
  @ApiOperation({
    summary: "Sacar no multiplicador atual (rodada RUNNING)",
    description:
      "Server-authoritative: sem body. O multiplicador vem do relógio do servidor; o payout " +
      "= aposta × multiplicador (floor). Dispara o crédito via saga SQS.",
  })
  @ApiResponse({ status: 200, description: "Saque efetuado (CASHED_OUT)." })
  @ApiResponse({ status: 404, description: "Sem aposta para sacar nesta rodada." })
  @ApiResponse({ status: 409, description: "Rodada não está RUNNING ou saque redundante." })
  async cashOut(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CashedOutBetDto> {
    const result = await this.cashout.execute(user.sub);
    return toCashedOutBetDto(unwrapOrThrow(result));
  }

  @Get("bets/me")
  @ApiOperation({ summary: "Histórico paginado das apostas do jogador autenticado" })
  @ApiResponse({ status: 200, description: "Lista de apostas (mais recentes primeiro)." })
  async mine(
    @CurrentUser() user: AuthenticatedUser,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ): Promise<{ items: BetHistoryDto[]; limit: number; offset: number }> {
    const { limit: lim, offset: off } = parsePagination(limit, offset);
    const views = await this.betQueries.findByPlayer(user.sub, lim, off);
    return { items: views.map(toBetHistoryDto), limit: lim, offset: off };
  }
}
