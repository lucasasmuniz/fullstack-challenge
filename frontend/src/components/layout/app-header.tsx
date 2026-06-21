"use client";

import { History, Plus, ArrowUpRight, Trophy, Settings, LogOut } from "lucide-react";
import { Logo } from "./logo";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/hooks/use-wallet";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useAuthActions } from "@/hooks/use-auth-actions";
import { useEnsureWallet } from "@/hooks/use-ensure-wallet";
import { useCountUp } from "@/hooks/use-count-up";
import { useUiStore } from "@/stores/ui-store";
import { formatBRL } from "@/lib/utils";

const ICON_BTN =
  "grid size-[38px] place-items-center rounded-[9px] border border-line bg-surface text-muted transition-colors hover:text-fg hover:border-primary-deep";

/**
 * Topbar do app (sticky). Adaptativa: anônimo vê Entrar/Criar conta; autenticado vê saldo,
 * ações (Depositar/Sacar/Histórico/LB/Settings abrem modais no F4) e avatar→logout. Saldo vem
 * do REST e será patcheado pelo WS `balance:updated` (F3).
 */
export function AppHeader() {
  const { username, isAuthenticated } = useCurrentUser();
  const { login, register, logout } = useAuthActions();
  const { data: wallet } = useWallet(isAuthenticated);
  const openModal = useUiStore((s) => s.open);
  useEnsureWallet();

  return (
    <header className="sticky top-0 z-40 flex h-[68px] items-center justify-between gap-3 border-b border-line bg-base/80 px-4 backdrop-blur-md md:px-6">
      <Logo />

      {isAuthenticated ? (
        <div className="flex items-center gap-2.5">
          <div className="flex flex-col items-end leading-tight pr-1.5">
            <span className="hidden text-[10px] uppercase tracking-[0.14em] text-faint sm:block">
              Saldo
            </span>
            {wallet ? (
              <Balance cents={wallet.balanceCents} />
            ) : (
              <span className="tabular text-base font-semibold text-primary">—</span>
            )}
          </div>

          <Button size="sm" className="h-[38px]" onClick={() => openModal({ type: "deposit" })}>
            <Plus className="size-[15px]" strokeWidth={2.4} />
            <span className="hidden sm:block">Depositar</span>
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="hidden h-[38px] sm:flex"
            onClick={() => openModal({ type: "withdraw" })}
          >
            <ArrowUpRight className="size-[15px]" strokeWidth={2.2} />
            Sacar
          </Button>

          <div className="hidden h-[26px] w-px bg-line md:block" />

          <button
            onClick={() => openModal({ type: "history" })}
            className={`hidden md:grid ${ICON_BTN}`}
            title="Histórico"
            aria-label="Histórico"
          >
            <History className="size-4" />
          </button>
          <button
            onClick={() => openModal({ type: "leaderboard" })}
            className={`hidden md:grid ${ICON_BTN}`}
            title="Leaderboard"
            aria-label="Leaderboard"
          >
            <Trophy className="size-4" />
          </button>
          <button
            onClick={() => openModal({ type: "settings" })}
            className={`hidden md:grid ${ICON_BTN}`}
            title="Configurações"
            aria-label="Configurações"
          >
            <Settings className="size-4" />
          </button>

          {/* Avatar é só rótulo do usuário logado; logout é explícito no botão ao lado. */}
          <div className="flex items-center gap-2 pl-1" title={username}>
            <Avatar name={username} />
            <span className="hidden text-sm font-medium lg:block">{username}</span>
          </div>
          <button onClick={logout} className={ICON_BTN} title="Sair" aria-label="Sair">
            <LogOut className="size-4" />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2.5">
          <Button variant="ghost" size="sm" onClick={register}>
            Criar conta
          </Button>
          <Button size="sm" onClick={login}>
            Entrar
          </Button>
        </div>
      )}
    </header>
  );
}

/** Saldo com count-up animado ao creditar/debitar. */
function Balance({ cents }: { cents: number }) {
  const animated = useCountUp(cents);
  return (
    <span className="tabular text-base font-semibold text-primary">
      {formatBRL(animated)}
    </span>
  );
}
