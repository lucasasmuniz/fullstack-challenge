import { Controller, Get } from "@nestjs/common";
import { CurrentUser, type AuthenticatedUser } from "@crash-game/nestjs-kit";

@Controller("auth")
export class AuthController {
  @Get("me")
  me(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }
}
