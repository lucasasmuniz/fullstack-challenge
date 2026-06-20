import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Query,
} from "@nestjs/common";
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
@Controller()
export class BetsController {
  constructor(
    private readonly placeBet: PlaceBetHandler,
    private readonly cashout: CashoutHandler,
    @Inject(BET_QUERY_REPOSITORY) private readonly betQueries: BetQueryRepository,
  ) {}

  @Post("bet")
  @HttpCode(201)
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
      BigInt(amountCents),
      autoCashoutTargetX100 ?? null,
    );
    return toPlacedBetDto(unwrapOrThrow(result));
  }

  @Post("bet/cashout")
  @HttpCode(200)
  async cashOut(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CashedOutBetDto> {
    // Sem body: server-authoritative. O player vem do JWT; o multiplicador, do relógio do servidor.
    const result = await this.cashout.execute(user.sub);
    return toCashedOutBetDto(unwrapOrThrow(result));
  }

  @Get("bets/me")
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
