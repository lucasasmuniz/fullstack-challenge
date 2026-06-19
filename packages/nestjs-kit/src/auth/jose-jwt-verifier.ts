import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTPayload,
  type JWTVerifyGetKey,
  type KeyLike,
} from "jose";
import type { AuthenticatedUser } from "./authenticated-user";
import type { JwtVerifier } from "./jwt-verifier";

type KeyInput = JWTVerifyGetKey | KeyLike | Uint8Array;

export interface JwksVerifierOptions {
  readonly issuer: string;
  readonly jwksUri: string;
  readonly authorizedParty?: string;
  readonly expectedTokenType?: string;
  readonly timeoutMs?: number;
}

interface VerifierChecks {
  readonly authorizedParty?: string;
  readonly expectedTokenType?: string;
}

export class JoseJwtVerifier implements JwtVerifier {
  constructor(
    private readonly key: KeyInput,
    private readonly issuer: string,
    private readonly checks: VerifierChecks = {},
  ) {}

  static fromJwksUri(options: JwksVerifierOptions): JoseJwtVerifier {
    const jwks = createRemoteJWKSet(new URL(options.jwksUri), {
      timeoutDuration: options.timeoutMs ?? 5_000,
      cooldownDuration: 30_000,
      cacheMaxAge: 600_000,
    });
    return new JoseJwtVerifier(jwks, options.issuer, {
      authorizedParty: options.authorizedParty,
      expectedTokenType: options.expectedTokenType,
    });
  }

  async verify(token: string): Promise<AuthenticatedUser> {
    const options = {
      issuer: this.issuer,
      algorithms: ["RS256"],
      clockTolerance: 5,
    };
    const { payload } =
      typeof this.key === "function"
        ? await jwtVerify(token, this.key, options)
        : await jwtVerify(token, this.key, options);

    this.assertTokenType(payload);
    this.assertAuthorizedParty(payload);
    return toAuthenticatedUser(payload);
  }

  private assertTokenType(payload: JWTPayload): void {
    if (this.checks.expectedTokenType === undefined) {
      return;
    }
    const typ = (payload as { typ?: unknown }).typ;
    if (typ !== this.checks.expectedTokenType) {
      throw new Error(
        `Unexpected token type '${String(typ)}' (expected '${this.checks.expectedTokenType}')`,
      );
    }
  }

  private assertAuthorizedParty(payload: JWTPayload): void {
    if (this.checks.authorizedParty === undefined) {
      return;
    }
    const azp = (payload as { azp?: unknown }).azp;
    if (azp !== this.checks.authorizedParty) {
      throw new Error(`Unexpected authorized party '${String(azp)}'`);
    }
  }
}

function toAuthenticatedUser(payload: JWTPayload): AuthenticatedUser {
  const { sub } = payload;
  if (typeof sub !== "string" || sub.length === 0) {
    throw new Error("JWT sem claim 'sub'");
  }
  const username = (payload as { preferred_username?: unknown })
    .preferred_username;
  return {
    sub,
    username: typeof username === "string" ? username : sub,
  };
}
