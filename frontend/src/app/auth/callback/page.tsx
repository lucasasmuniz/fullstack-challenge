"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "react-oidc-context";

/** Aterrissagem do redirect OIDC. O AuthProvider processa o code automaticamente; aqui só roteamos. */
export default function AuthCallbackPage() {
  const auth = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (auth.isAuthenticated) {
      const state = auth.user?.state as { returnTo?: string } | undefined;
      const returnTo = state?.returnTo;
      router.replace(returnTo && returnTo !== "/" ? returnTo : "/lobby");
    } else if (auth.error) {
      router.replace("/");
    }
  }, [auth.isAuthenticated, auth.error, auth.user, router]);

  return (
    <main className="flex flex-1 items-center justify-center text-muted">
      {auth.error ? "Falha no login. Redirecionando…" : "Entrando…"}
    </main>
  );
}
