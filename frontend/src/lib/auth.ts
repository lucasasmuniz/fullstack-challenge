import {
  UserManager,
  WebStorageStateStore,
  type UserManagerSettings,
} from "oidc-client-ts";
import { env } from "./env";

/**
 * UserManager (OIDC authorization-code + PKCE) contra o Keycloak. Realm é **public client**:
 * todo o fluxo roda no browser, sem segredo. Criação lazy + client-only (toca `window`/`localStorage`),
 * então NUNCA chame no server (SSR) — só dentro de componentes/hooks client.
 */
let manager: UserManager | undefined;

export function getUserManager(): UserManager {
  if (!manager) {
    const settings: UserManagerSettings = {
      authority: env.keycloak.authority,
      client_id: env.keycloak.clientId,
      redirect_uri: `${env.appUrl}/auth/callback`,
      post_logout_redirect_uri: env.appUrl,
      response_type: "code",
      scope: "openid profile",
      automaticSilentRenew: true,
      userStore: new WebStorageStateStore({ store: window.localStorage }),
    };
    manager = new UserManager(settings);
  }
  return manager;
}

/** Pós-callback: remove `code`/`state` da URL sem recarregar (o redirect real é feito na página). */
export function onSigninCallback(): void {
  window.history.replaceState({}, document.title, window.location.pathname);
}
