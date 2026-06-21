"use client";

import { useEffect } from "react";
import { useAuth } from "react-oidc-context";

/**
 * Lida com o fim da sessão sem recarregar a página. O `automaticSilentRenew` renova o access token
 * antes de expirar; quando a sessão SSO morre e a renovação falha (`addAccessTokenExpired` ou
 * `addSilentRenewError`), removemos o usuário → a UI volta ao **modo anônimo** reativamente (tudo lê
 * `useAuth`), em vez de mostrar a tela de erro do Keycloak. Idem para erro de signin (state/token
 * stale): limpamos e dropamos pra anônimo. Renderiza nada.
 */
export function AuthSessionManager() {
  const auth = useAuth();
  const { events, removeUser } = auth;

  useEffect(() => {
    const drop = () => void removeUser();
    events.addAccessTokenExpired(drop);
    events.addSilentRenewError(drop);
    return () => {
      events.removeAccessTokenExpired(drop);
      events.removeSilentRenewError(drop);
    };
  }, [events, removeUser]);

  // Qualquer erro surfaceado (callback/renew com state ou token inválido) → cai pra anônimo,
  // sem deixar a UI presa numa mensagem de erro.
  useEffect(() => {
    if (auth.error) void removeUser();
  }, [auth.error, removeUser]);

  return null;
}
