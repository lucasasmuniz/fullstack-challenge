"use client";

import Link from "next/link";
import { Plane, Lock, TrendingUp } from "lucide-react";

interface GameCard {
  readonly id: string;
  readonly name: string;
  readonly tag: string;
  readonly href?: string;
  readonly soon?: boolean;
}

const GAMES: readonly GameCard[] = [
  { id: "crash", name: "Crash · Avião", tag: "ao vivo", href: "/game" },
  { id: "dice", name: "Dice", tag: "em breve", soon: true },
  { id: "mines", name: "Mines", tag: "em breve", soon: true },
  { id: "roulette", name: "Roleta", tag: "em breve", soon: true },
];

/** Lobby / seleção de jogo (4.2) — só Crash ativo; os demais "Em breve". */
export default function LobbyPage() {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
      <h1 className="font-display text-2xl font-bold tracking-tight">Jogos</h1>
      <p className="mt-1 text-sm text-muted">Escolha um jogo para começar.</p>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {GAMES.map((game) =>
          game.soon ? (
            <div
              key={game.id}
              aria-disabled
              className="flex aspect-[4/3] cursor-not-allowed flex-col justify-between rounded-xl border border-line bg-surface p-5 opacity-50"
            >
              <Lock className="size-5 text-faint" />
              <div>
                <div className="font-display font-semibold">{game.name}</div>
                <div className="text-xs uppercase tracking-wider text-faint">
                  {game.tag}
                </div>
              </div>
            </div>
          ) : (
            <Link
              key={game.id}
              href={game.href ?? "#"}
              className="group flex aspect-[4/3] flex-col justify-between rounded-xl border border-line bg-surface p-5 transition-colors hover:border-primary-deep hover:bg-elevated"
            >
              <span className="grid size-11 place-items-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-base group-hover:shadow-glow">
                <Plane className="size-6" />
              </span>
              <div>
                <div className="flex items-center gap-2 font-display font-semibold">
                  {game.name}
                  <TrendingUp className="size-4 text-primary" />
                </div>
                <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-primary">
                  <span className="size-1.5 rounded-full bg-primary" />
                  {game.tag}
                </div>
              </div>
            </Link>
          ),
        )}
      </div>
    </main>
  );
}
