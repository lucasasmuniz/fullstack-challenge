import { Body, Controller, Get, HttpCode, Post } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { CurrentUser, type AuthenticatedUser } from "@crash-game/nestjs-kit";
import { AutoBetService } from "../../application/auto-bet.service";
import {
  toAutoBetSessionDto,
  type AutoBetSessionDto,
} from "../dtos/auto-bet.dto";
import { unwrapOrThrow } from "../http/domain-http";
import { autoBetBodySchema, parseOrBadRequest } from "../http/validation";

/**
 * Auto-bet: o jogador configura uma sessão que **o servidor** executa a cada rodada
 * (Martingale/fixo + freios), resiliente a aba fechada. Kong faz strip de `/games` →
 * `/autobet`. Auth global; `playerId` vem do `sub` do JWT, nunca do body.
 */
@ApiTags("auto-bet")
@ApiBearerAuth("bearer")
@Controller("autobet")
export class AutoBetController {
  constructor(private readonly autoBet: AutoBetService) {}

  @Post()
  @HttpCode(201)
  @ApiOperation({
    summary: "Inicia uma sessão de auto-bet (1 ativa por jogador)",
    description:
      "O servidor passa a apostar a cada rodada segundo a estratégia (FIXED/MARTINGALE), sacando " +
      "no alvo (auto-cashout) e respeitando os freios. stop-loss e budget são obrigatórios.",
  })
  @ApiBody({
    schema: {
      type: "object",
      required: [
        "strategy",
        "baseAmountCents",
        "autoCashoutTargetX100",
        "stopLossCents",
        "budgetCents",
      ],
      properties: {
        strategy: { type: "string", enum: ["FIXED", "MARTINGALE"], example: "MARTINGALE" },
        baseAmountCents: { type: "integer", example: 100, description: "Aposta base (centavos)." },
        autoCashoutTargetX100: { type: "integer", example: 150, description: "Alvo ×100 (> 100)." },
        stopLossCents: { type: "integer", example: 5000, description: "Perda líquida máx. (centavos)." },
        budgetCents: { type: "integer", example: 20000, description: "Teto de exposição acumulada." },
        stopWinCents: { type: "integer", nullable: true, example: 5000, description: "Lucro alvo (opcional)." },
        maxRounds: { type: "integer", nullable: true, example: 20, description: "Máx. de rodadas (opcional)." },
      },
    },
  })
  @ApiResponse({ status: 201, description: "Sessão criada (ACTIVE)." })
  @ApiResponse({ status: 409, description: "Já existe uma sessão ativa." })
  @ApiResponse({ status: 422, description: "Configuração inválida." })
  async start(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
  ): Promise<AutoBetSessionDto> {
    const cfg = parseOrBadRequest(autoBetBodySchema, body);
    const result = await this.autoBet.start(user.sub, user.username, {
      strategy: cfg.strategy,
      baseAmountCents: BigInt(cfg.baseAmountCents),
      autoCashoutTargetX100: cfg.autoCashoutTargetX100,
      stopLossCents: BigInt(cfg.stopLossCents),
      budgetCents: BigInt(cfg.budgetCents),
      stopWinCents: cfg.stopWinCents != null ? BigInt(cfg.stopWinCents) : null,
      maxRounds: cfg.maxRounds ?? null,
    });
    return toAutoBetSessionDto(unwrapOrThrow(result));
  }

  @Get("me")
  @ApiOperation({
    summary: "Sessão de auto-bet mais recente do jogador (ativa ou já encerrada; ou null)",
  })
  @ApiResponse({ status: 200, description: "Sessão mais recente (ou null)." })
  async me(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AutoBetSessionDto | null> {
    const session = await this.autoBet.getLatest(user.sub);
    return session ? toAutoBetSessionDto(session) : null;
  }

  @Post("stop")
  @HttpCode(200)
  @ApiOperation({ summary: "Para a sessão de auto-bet ativa do jogador" })
  @ApiResponse({ status: 200, description: "Sessão parada (STOPPED)." })
  @ApiResponse({ status: 409, description: "Nenhuma sessão ativa." })
  async stop(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AutoBetSessionDto> {
    const result = await this.autoBet.stop(user.sub);
    return toAutoBetSessionDto(unwrapOrThrow(result));
  }
}
