"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "react-oidc-context";
import { Logo } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";
import { useAuthActions } from "@/hooks/use-auth-actions";

/** Landing / Login — hero + CTA que redireciona ao Keycloak (OIDC). */
export default function LandingPage() {
  const auth = useAuth();
  const router = useRouter();
  const { login, register } = useAuthActions();
  const busy = auth.isLoading || auth.activeNavigator !== undefined;

  useEffect(() => {
    if (auth.isAuthenticated) router.replace("/lobby");
  }, [auth.isAuthenticated, router]);

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex h-[68px] items-center px-6">
        <Logo />
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center gap-8 px-6 py-16 text-center">
        <h1 className="font-display text-4xl font-bold leading-[1.1] tracking-tight sm:text-6xl">
          Sua sorte sobe.
          <br />
          <span className="text-primary">Saiba sacar a tempo.</span>
        </h1>
        <p className="max-w-lg text-balance text-base text-muted sm:text-lg">
          Aposte, veja o multiplicador subir em tempo real e saque antes do
          crash. Resultado pré-determinado e verificável.
        </p>
        <div className="mt-2 flex flex-col items-center gap-3 sm:flex-row">
          <Button size="lg" onClick={login} loading={busy}>
            {busy ? "Entrando…" : "Entrar"}
          </Button>
          <Button variant="secondary" size="lg" onClick={register} disabled={busy}>
            Criar conta
          </Button>
        </div>
        <Link
          href="/lobby"
          className="text-sm text-muted underline-offset-4 transition-colors hover:text-fg hover:underline"
        >
          Entrar como visitante →
        </Link>
      </main>
    </div>
  );
}
