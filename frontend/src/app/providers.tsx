"use client";

import { useEffect, useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "react-oidc-context";
import { Toaster } from "sonner";
import { getUserManager, onSigninCallback } from "@/lib/auth";

/**
 * Providers globais do client. O UserManager (OIDC) toca `window`/`localStorage`, então o
 * AuthProvider e tudo que consome `useAuth` só montam **após** o client hidratar (app logado =
 * client-side, sem prerender). Até lá mostramos um loader neutro — evita crash de SSR e mismatch.
 * QueryClient criado uma vez por mount (não no módulo) para não vazar cache entre requests.
 */
export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 5_000, retry: 1, refetchOnWindowFocus: false },
        },
      }),
  );
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <QueryClientProvider client={queryClient}>
      {mounted ? (
        <AuthProvider
          userManager={getUserManager()}
          onSigninCallback={onSigninCallback}
        >
          {children}
        </AuthProvider>
      ) : (
        <div className="flex min-h-screen items-center justify-center text-muted">
          Carregando…
        </div>
      )}
      <Toaster theme="dark" position="top-center" richColors closeButton />
    </QueryClientProvider>
  );
}
