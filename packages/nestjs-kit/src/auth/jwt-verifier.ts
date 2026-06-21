import type { AuthenticatedUser } from "./authenticated-user";

/** Porta de verificação de token — o guard depende desta interface, não da impl concreta (jose). */
export interface JwtVerifier {
  verify(token: string): Promise<AuthenticatedUser>;
}

export const JWT_VERIFIER = Symbol("JWT_VERIFIER");
