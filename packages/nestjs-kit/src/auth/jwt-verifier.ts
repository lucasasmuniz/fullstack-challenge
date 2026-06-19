import type { AuthenticatedUser } from "./authenticated-user";

/**
 * Porta de verificação de token. A aplicação depende desta interface, não da
 * implementação concreta (jose) — facilita testar o guard com um fake e troca a
 * estratégia de validação sem tocar no guard.
 */
export interface JwtVerifier {
  /** Valida assinatura + claims e devolve o usuário, ou lança se inválido. */
  verify(token: string): Promise<AuthenticatedUser>;
}

/** Token DI para injetar a {@link JwtVerifier}. */
export const JWT_VERIFIER = Symbol("JWT_VERIFIER");
