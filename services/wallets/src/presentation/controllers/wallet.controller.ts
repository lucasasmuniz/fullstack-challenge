import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { CurrentUser, type AuthenticatedUser } from "@crash-game/nestjs-kit";
import { CreateWalletHandler } from "../../application/create-wallet.handler";
import { GetWalletHandler } from "../../application/get-wallet.handler";
import { DepositHandler } from "../../application/deposit.handler";
import { WithdrawHandler } from "../../application/withdraw.handler";
import {
  toWalletResponse,
  type WalletResponseDto,
} from "../dtos/wallet-response.dto";
import { unwrapOrThrow } from "../http/domain-http";
import {
  amountBodySchema,
  idempotencyKeySchema,
  parseOrBadRequest,
} from "../http/validation";

/**
 * Rotas da própria carteira (Kong faz strip de `/wallets`, então internamente são
 * `/`, `/me`, `/deposit`, `/withdraw`). Todas exigem auth (guard global); o
 * `player_id` vem **sempre** do `sub` do JWT, nunca do body.
 */
@ApiTags("wallet")
@ApiBearerAuth("bearer")
@Controller()
export class WalletController {
  constructor(
    private readonly createWallet: CreateWalletHandler,
    private readonly getWallet: GetWalletHandler,
    private readonly deposit: DepositHandler,
    private readonly withdraw: WithdrawHandler,
  ) {}

  @Post()
  @ApiOperation({ summary: "Cria a carteira do jogador autenticado" })
  @ApiResponse({ status: 201, description: "Carteira criada." })
  @ApiResponse({ status: 409, description: "Carteira já existe." })
  async create(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<WalletResponseDto> {
    const result = await this.createWallet.execute(user.sub);
    return toWalletResponse(unwrapOrThrow(result));
  }

  @Get("me")
  @ApiOperation({ summary: "Retorna a carteira e o saldo do jogador autenticado" })
  @ApiResponse({ status: 200, description: "Carteira + saldo (centavos)." })
  @ApiResponse({ status: 404, description: "Carteira não encontrada." })
  async me(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<WalletResponseDto> {
    const result = await this.getWallet.execute(user.sub);
    return toWalletResponse(unwrapOrThrow(result));
  }

  @Post("deposit")
  @HttpCode(200)
  @ApiOperation({
    summary: "Depósito na própria carteira (intra-contexto, idempotente)",
    description:
      "Crédito reason=deposit. Idempotente pelo header Idempotency-Key (mesma key+valor → no-op; " +
      "mesma key, valor diferente → 409). Distinto do crédito do jogo (que flui pela saga SQS).",
  })
  @ApiHeader({ name: "Idempotency-Key", required: true, description: "UUID único por operação." })
  @ApiBody({
    schema: {
      type: "object",
      required: ["amountCents"],
      properties: { amountCents: { type: "integer", example: 50000, description: "Centavos (> 0)." } },
    },
  })
  @ApiResponse({ status: 200, description: "Saldo atualizado." })
  @ApiResponse({ status: 400, description: "Idempotency-Key ausente/ inválida ou valor inválido." })
  @ApiResponse({ status: 409, description: "Reuso de Idempotency-Key com valor diferente." })
  async depositFunds(
    @CurrentUser() user: AuthenticatedUser,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: unknown,
  ): Promise<WalletResponseDto> {
    const correlationId = parseOrBadRequest(idempotencyKeySchema, idempotencyKey);
    const { amountCents } = parseOrBadRequest(amountBodySchema, body);
    const result = await this.deposit.execute(
      user.sub,
      BigInt(amountCents),
      correlationId,
    );
    return toWalletResponse(unwrapOrThrow(result));
  }

  @Post("withdraw")
  @HttpCode(200)
  @ApiOperation({
    summary: "Saque da própria carteira (intra-contexto, idempotente)",
    description: "Débito reason=withdrawal. Respeita o saldo (saldo nunca fica negativo).",
  })
  @ApiHeader({ name: "Idempotency-Key", required: true, description: "UUID único por operação." })
  @ApiBody({
    schema: {
      type: "object",
      required: ["amountCents"],
      properties: { amountCents: { type: "integer", example: 10000, description: "Centavos (> 0)." } },
    },
  })
  @ApiResponse({ status: 200, description: "Saldo atualizado." })
  @ApiResponse({ status: 409, description: "Saldo insuficiente ou reuso de key com valor diferente." })
  async withdrawFunds(
    @CurrentUser() user: AuthenticatedUser,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: unknown,
  ): Promise<WalletResponseDto> {
    const correlationId = parseOrBadRequest(idempotencyKeySchema, idempotencyKey);
    const { amountCents } = parseOrBadRequest(amountBodySchema, body);
    const result = await this.withdraw.execute(
      user.sub,
      BigInt(amountCents),
      correlationId,
    );
    return toWalletResponse(unwrapOrThrow(result));
  }
}
