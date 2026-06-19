import {
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { AuthenticatedUser } from "./authenticated-user";
import { IS_PUBLIC_KEY } from "./public.decorator";
import { JWT_VERIFIER, type JwtVerifier } from "./jwt-verifier";

interface RequestWithUser {
  headers: Record<string, string | string[] | undefined>;
  user?: AuthenticatedUser;
}

/**
 * Guard global secure-by-default: toda rota exige um Bearer token válido, salvo
 * as marcadas com `@Public()`. Em sucesso, popula `req.user` ({@link AuthenticatedUser});
 * em qualquer falha, responde 401 sem vazar detalhes ao cliente.
 */
@Injectable()
export class JwksGuard implements CanActivate {
  private readonly logger = new Logger(JwksGuard.name);

  constructor(
    private readonly reflector: Reflector,
    @Inject(JWT_VERIFIER) private readonly verifier: JwtVerifier,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const token = extractBearerToken(request.headers.authorization);
    if (token === null) {
      throw new UnauthorizedException("Missing bearer token");
    }

    try {
      request.user = await this.verifier.verify(token);
      return true;
    } catch (error) {
      this.logger.debug(`JWT rejected: ${describeError(error)}`);
      throw new UnauthorizedException("Invalid token");
    }
  }
}

function extractBearerToken(
  header: string | string[] | undefined,
): string | null {
  const value = Array.isArray(header) ? header[0] : header;
  if (value === undefined) {
    return null;
  }
  const [scheme, token] = value.split(" ");
  return scheme?.toLowerCase() === "bearer" && token ? token : null;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
