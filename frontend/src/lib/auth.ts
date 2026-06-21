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
      // State em sessionStorage (some ao fechar a aba) — evita acúmulo de state stale no localStorage,
      // a causa do erro "no matching state" ao reabrir o login depois de uma sessão antiga.
      stateStore: new WebStorageStateStore({ store: window.sessionStorage }),
    };
    manager = new UserManager(settings);
  }
  return manager;
}

/**
 * Inicia o login limpando state stale antes — uma tentativa anterior abortada deixa entradas órfãs
 * que fariam o callback falhar com "No matching state". Em erro, segue para o redirect mesmo assim
 * (a stack do Keycloak resolve), nunca trava o usuário.
 */
export async function startSignin(args?: Parameters<UserManager["signinRedirect"]>[0]): Promise<void> {
  const um = getUserManager();
  try {
    await um.clearStaleState();
  } catch {
    /* best-effort */
  }
  await um.signinRedirect(args);
}

/** Pós-callback: remove `code`/`state` da URL sem recarregar (o redirect real é feito na página). */
export function onSigninCallback(): void {
  window.history.replaceState({}, document.title, window.location.pathname);
}
