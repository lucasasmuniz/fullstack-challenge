"use client";

import { useEffect, type ReactNode } from "react";
import { useAuth } from "react-oidc-context";

/**
 * Protege rotas autenticadas. Enquanto o OIDC carrega, mostra um estado neutro; sem sessão,
 * dispara o redirect (authorization-code + PKCE) para o Keycloak. Client-only.
 */
export function AuthGuard({ children }: { children: ReactNode }) {
  const auth = useAuth();

  useEffect(() => {
    if (!auth.isLoading && !auth.isAuthenticated && !auth.activeNavigator) {
      void auth.signinRedirect();
    }
  }, [auth.isLoading, auth.isAuthenticated, auth.activeNavigator, auth]);

  if (auth.isAuthenticated) return <>{children}</>;

  return (
    <main className="flex flex-1 items-center justify-center text-muted">
      {auth.error ? "Falha na autenticação." : "Carregando…"}
    </main>
  );
}
