"use client";

import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuthActions } from "@/hooks/use-auth-actions";

/** Cobre o painel de aposta para visitantes: entrar para apostar + destaque "Criar conta". */
export function AnonBetOverlay() {
  const { login, register } = useAuthActions();

  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 rounded-xl bg-base/80 p-6 text-center backdrop-blur-sm">
      <span className="grid size-12 place-items-center rounded-full border border-line bg-elevated text-primary">
        <Lock className="size-5" />
      </span>
      <div className="flex flex-col gap-1">
        <span className="font-display text-base font-semibold">Entre para apostar</span>
        <span className="text-xs text-muted">Aposta manual e automática são exclusivas para jogadores.</span>
      </div>
      <div className="flex w-full max-w-[220px] flex-col gap-2">
        <Button onClick={login} className="w-full">
          Entrar
        </Button>
        <button
          onClick={register}
          className="text-sm font-medium text-primary underline-offset-4 transition-opacity hover:underline"
        >
          Não tem conta? Crie conta
        </button>
      </div>
    </div>
  );
}
