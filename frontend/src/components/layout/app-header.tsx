"use client";

import { useAuth } from "react-oidc-context";
import { History, Plus, ArrowUpRight, Trophy, Settings } from "lucide-react";
import { Logo } from "./logo";
import { useWallet } from "@/hooks/use-wallet";
import { useCurrentUser } from "@/hooks/use-current-user";
import { formatBRL } from "@/lib/utils";

/**
 * Topbar do app (sticky). Saldo vem do REST e será patcheado pelo WS `balance:updated` (F3).
 * As ações de Depositar/Sacar/Histórico/Leaderboard/Settings abrem modais no F4 — aqui só os gatilhos.
 */
export function AppHeader() {
  const auth = useAuth();
  const { username, initials, isAuthenticated } = useCurrentUser();
  const { data: wallet } = useWallet(isAuthenticated);

  const iconBtn =
    "grid size-[38px] place-items-center rounded-[9px] border border-line bg-surface text-muted transition-colors hover:text-fg hover:border-primary-deep";

  return (
    <header className="sticky top-0 z-40 flex h-[68px] items-center justify-between gap-3 border-b border-line bg-base/80 px-4 backdrop-blur-md md:px-6">
      <Logo />

      <div className="flex items-center gap-2.5">
        <div className="flex flex-col items-end leading-tight pr-1.5">
          <span className="hidden text-[10px] uppercase tracking-[0.14em] text-faint sm:block">
            Saldo
          </span>
          <span className="tabular text-base font-semibold text-primary">
            {wallet ? formatBRL(wallet.balanceCents) : "—"}
          </span>
        </div>

        <button className="flex h-[38px] items-center gap-1.5 rounded-[9px] bg-primary px-4 font-display text-[13.5px] font-semibold text-base transition-colors hover:bg-primary-glow hover:shadow-glow">
          <Plus className="size-[15px]" strokeWidth={2.4} />
          <span className="hidden sm:block">Depositar</span>
        </button>
        <button className="hidden h-[38px] items-center gap-1.5 rounded-[9px] border border-line bg-surface px-4 font-display text-[13.5px] font-medium transition-colors hover:border-primary-deep hover:bg-elevated sm:flex">
          <ArrowUpRight className="size-[15px]" strokeWidth={2.2} />
          Sacar
        </button>

        <div className="hidden h-[26px] w-px bg-line md:block" />

        <button className={`hidden md:grid ${iconBtn}`} title="Histórico" aria-label="Histórico">
          <History className="size-4" />
        </button>
        <button className={`hidden md:grid ${iconBtn}`} title="Leaderboard" aria-label="Leaderboard">
          <Trophy className="size-4" />
        </button>
        <button className={`hidden md:grid ${iconBtn}`} title="Settings" aria-label="Configurações">
          <Settings className="size-4" />
        </button>

        <button
          onClick={() => void auth.signoutRedirect()}
          title={`Sair (${username})`}
          aria-label="Sair"
          className="grid size-8 place-items-center rounded-full bg-gradient-to-br from-primary-deep to-primary font-display text-[13px] font-bold text-base"
        >
          {initials}
        </button>
      </div>
    </header>
  );
}
