"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "react-oidc-context";
import { Radio, ShieldCheck, Coins } from "lucide-react";
import { Logo } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";
import { useAuthActions } from "@/hooks/use-auth-actions";

const STATS = [
  { icon: Radio, title: "Tempo real", sub: "multiplayer · WebSocket" },
  { icon: ShieldCheck, title: "Provably Fair", sub: "hash chain verificável" },
  { icon: Coins, title: "0% float", sub: "centavos inteiros" },
] as const;

/** Landing / Login (4.1) — hero + CTA que redireciona ao Keycloak (OIDC). */
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

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center gap-12 px-6 py-16 text-center">
        <div className="flex flex-col items-center gap-6">
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
        </div>

        <div className="grid w-full max-w-2xl grid-cols-1 gap-4 sm:grid-cols-3">
          {STATS.map(({ icon: Icon, title, sub }) => (
            <div
              key={title}
              className="flex flex-col items-center gap-2 rounded-xl border border-line bg-surface p-5"
            >
              <Icon className="size-6 text-primary" />
              <span className="font-display font-semibold">{title}</span>
              <span className="text-xs text-faint">{sub}</span>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
