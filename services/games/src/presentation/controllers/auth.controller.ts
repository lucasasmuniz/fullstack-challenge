import { Controller, Get } from "@nestjs/common";
import { CurrentUser, type AuthenticatedUser } from "@crash-game/nestjs-kit";

/**
 * Endpoint-sonda protegido: prova a ponta a ponta de auth (Kong → guard JWKS →
 * `sub` do JWT). Sai pela rota `GET /games/auth/me` (Kong faz strip do `/games`).
 * Vira a base do `current-user` reutilizado pelas rotas autenticadas das próximas
 * etapas (`bet`, `cashout`, `bets/me`).
 */
@Controller("auth")
export class AuthController {
  @Get("me")
  me(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }
}
