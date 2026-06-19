import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
} from "@nestjs/common";
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
@Controller()
export class WalletController {
  constructor(
    private readonly createWallet: CreateWalletHandler,
    private readonly getWallet: GetWalletHandler,
    private readonly deposit: DepositHandler,
    private readonly withdraw: WithdrawHandler,
  ) {}

  @Post()
  async create(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<WalletResponseDto> {
    const result = await this.createWallet.execute(user.sub);
    return toWalletResponse(unwrapOrThrow(result));
  }

  @Get("me")
  async me(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<WalletResponseDto> {
    const result = await this.getWallet.execute(user.sub);
    return toWalletResponse(unwrapOrThrow(result));
  }

  @Post("deposit")
  @HttpCode(200)
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
