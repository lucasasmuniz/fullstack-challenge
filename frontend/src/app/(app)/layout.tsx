import type { ReactNode } from "react";
import { AppHeader } from "@/components/layout/app-header";
import { Modals } from "@/components/game/modals";

/**
 * Shell do app: topbar + conteúdo + modais. **Sem guard** — o jogo é público (espectador anônimo,
 * como o gateway WS híbrido permite). A autenticação é exigida por **ação** (apostar/sacar/depositar),
 * não por rota; o anônimo vê CTAs de Entrar/Criar conta.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader />
      {children}
      <Modals />
    </div>
  );
}
