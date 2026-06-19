import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { AuthenticatedUser } from "./authenticated-user";

/**
 * Injeta o {@link AuthenticatedUser} populado pelo {@link JwksGuard}.
 * Só use em rotas protegidas (sem `@Public`); fora delas `req.user` é undefined
 * e o decorator lança — sinal de erro de programação, não de runtime do cliente.
 */
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
