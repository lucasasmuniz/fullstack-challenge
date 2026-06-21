import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { AuthenticatedUser } from "./authenticated-user";

/** Injeta o `AuthenticatedUser` populado pelo guard. Lança se usado fora de rota protegida. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>();
    if (!request.user) {
      throw new Error(
        "@CurrentUser() usado numa rota sem o JwksGuard (rota pública?).",
      );
    }
    return request.user;
  },
);
