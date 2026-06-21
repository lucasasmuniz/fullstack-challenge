"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "react-oidc-context";

/** Aterrissagem do redirect OIDC. O AuthProvider processa o code automaticamente; aqui só roteamos. */
export default function AuthCallbackPage() {
  const auth = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (auth.isAuthenticated) router.replace("/lobby");
    else if (auth.error) router.replace("/");
  }, [auth.isAuthenticated, auth.error, router]);

  return (
    <main className="flex flex-1 items-center justify-center text-muted">
      {auth.error ? "Falha no login. Redirecionando…" : "Entrando…"}
    </main>
  );
}
