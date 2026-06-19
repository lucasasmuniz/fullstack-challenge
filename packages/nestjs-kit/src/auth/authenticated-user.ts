/**
 * Identidade do jogador autenticado, derivada do access token (JWT) do Keycloak.
 * `sub` é o id estável do usuário no IdP — é dele que toda autorização por dono do
 * recurso parte (nunca de path/body/query). Ver DEVELOPMENT_GUIDELINE §1.4.
 */
export interface AuthenticatedUser {
  readonly sub: string;
  readonly username: string;
}
