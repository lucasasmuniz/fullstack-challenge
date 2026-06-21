/**
 * Config pública do client (vars `NEXT_PUBLIC_*`, embutidas no bundle no build).
 * Defaults de dev apontam para a stack local via Kong; em produção sobrescreva no ambiente.
 */
export const env = {
  /** Único ponto de entrada (Kong): REST `/games/*` `/wallets/*` + WS. */
  apiUrl: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000",
  /** Mesma origem do Kong; o namespace/path do socket diferencia games/wallets. */
  wsUrl: process.env.NEXT_PUBLIC_WS_URL ?? "http://localhost:8000",
  /** Origem pública do próprio front (redirect/logout do OIDC). */
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  keycloak: {
    authority:
      process.env.NEXT_PUBLIC_KEYCLOAK_AUTHORITY ??
      "http://localhost:8080/realms/crash-game",
    clientId:
      process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID ?? "crash-game-client",
  },
} as const;
