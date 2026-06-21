"use client";

import { useEffect } from "react";
import { useAuth } from "react-oidc-context";

/**
 * Lida com o fim da sessão sem recarregar a página. O `automaticSilentRenew` (no UserManager)
 * já renova o access token via refresh token antes de expirar; quando a sessão SSO finalmente
 * morre e a renovação falha, `addAccessTokenExpired` dispara e removemos o usuário → a UI volta
 * ao modo anônimo (espectador) reativamente, pois tudo lê `useAuth`. Renderiza nada.
 */
export function AuthSessionManager() {
  const { events, removeUser } = useAuth();

  useEffect(() => {
    const onExpired = () => void removeUser();
    events.addAccessTokenExpired(onExpired);
    return () => events.removeAccessTokenExpired(onExpired);
  }, [events, removeUser]);

  return null;
}
