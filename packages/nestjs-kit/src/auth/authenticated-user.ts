/**
 * Identidade do jogador autenticado (do JWT). `sub` é o id estável no IdP — toda autorização por
 * dono do recurso parte dele, nunca de path/body/query.
 */
export interface AuthenticatedUser {
  readonly sub: string;
  readonly username: string;
}
