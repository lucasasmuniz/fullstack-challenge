# Frontend — JUNGLEcrash 🎮

Interface do crash game em tempo real: curva animada, apostas (manual e auto), cashout, histórico,
leaderboard e verificação provably-fair. Dark "fintech premium" com acento verde neon.

> Sobe junto com tudo via `bun run docker:up` (raiz) → **http://localhost:3000**.
> Decisões de arquitetura e o log de desenvolvimento estão em [`docs/AI_WORKFLOW.md`](../docs/AI_WORKFLOW.md).

## Stack

Next.js 16 (App Router) · React 19 · Tailwind CSS v4 + shadcn-style · **TanStack Query** (server state) ·
**Zustand** (client state) · `socket.io-client` (WebSocket) · `oidc-client-ts`/`react-oidc-context` (auth).
Workspace do monorepo Bun — **reusa** `@crash-game/curve` (mesma fórmula da curva do servidor) e
`@crash-game/realtime-contracts` (tipos dos eventos WS).

## Rodar fora do Docker

```bash
cp .env.example .env.local   # defaults já apontam para a stack local via Kong
bun install                  # na raiz do monorepo
cd frontend && bun run dev   # http://localhost:3000  (precisa da infra: docker compose up -d ...)
```

| Var (`NEXT_PUBLIC_*`) | Default | Uso |
| --- | --- | --- |
| `API_URL` / `WS_URL` | `http://localhost:8000` | REST e WebSocket via Kong |
| `APP_URL` | `http://localhost:3000` | redirect/logout do OIDC |
| `KEYCLOAK_AUTHORITY` | `…/realms/crash-game` | issuer OIDC |
| `KEYCLOAK_CLIENT_ID` | `crash-game-client` | public client (PKCE) |

## Arquitetura

- **Server state (TanStack Query):** REST via Kong (`rounds/current|history`, `bets/me`, `wallet/me`,
  `leaderboard`, `verify`, `autobet`). O WebSocket **patcheia o cache** (ex.: `balance:updated`).
- **Client state (Zustand):** fase da rodada, apostas ao vivo, histórico, conexão (`game-store`); modal
  ativo (`ui-store`); preferências de som persistidas (`prefs-store`).
- **Multiplicador (dead reckoning):** a autoridade é o `elapsedMs` do último `round:tick`; entre ticks o
  cliente extrapola pela curva — **fora do React state** (rAF + store), sem re-render a 60fps. A curva é
  não-autoritativa (ADR 0016); `round:crashed` é o override.
- **Auth:** OIDC authorization-code + PKCE no browser (Keycloak é public client). Jogo é **público**
  (espectador anônimo); a auth é exigida por **ação** (apostar/sacar). Carteira é auto-provisionada no
  1º login (`POST /wallets` idempotente). Login/registro usam um **theme custom do Keycloak**.

## Telas

Landing (hero + CTA) · Lobby (só Crash ativo) · **Jogo** (curva + painel inline de aposta/auto + apostas
ao vivo + histórico) · modais (depositar, sacar, histórico, leaderboard, verificar, settings).
**Regra:** aposta/cashout são **inline, nunca modal**; modais só para ações não-críticas no tempo.

## Scripts

```bash
bun run dev         # desenvolvimento
bun run build       # build de produção (standalone)
bun run lint        # ESLint (toolchain Next)
bun run typecheck   # tsc --noEmit
bun run test:e2e    # Playwright (precisa da stack de pé + browsers do SO)
```
