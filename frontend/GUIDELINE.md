# Frontend GUIDELINE — JUNGLEcrash (Next.js)

> Leia **antes** de tocar no código do frontend. Vale junto com `docs/guidelines/DEVELOPMENT_GUIDELINE.md`
> (princípios gerais), `docs/frontend/design-prompt.md` (design system / tokens) e o roadmap por steps
> F0–F8 no Session Log (`docs/AI_WORKFLOW.md`). Gate de aprovação continua valendo: **não commitar sem
> "ok" do Lucas**.

## Stack (travada)

Next.js 16 (App Router) · React 19 · Tailwind CSS v4 (CSS-first, tokens em `globals.css`) · shadcn/ui
(primitivos) · **TanStack Query** (server state) · **Zustand** (client state) · `socket.io-client` (WS) ·
`oidc-client-ts` + `react-oidc-context` (auth) · `sonner` (toasts) · `lucide-react` (ícones). Vive como
workspace `frontend` no monorepo Bun e **reusa** `@crash-game/curve` (animação da curva) e
`@crash-game/realtime-contracts` (tipos dos eventos WS) via `transpilePackages`.

## ⚠️ Next 16 NÃO é o Next do seu treino

Há breaking changes vs versões antigas. **Antes de escrever código de app, consulte
`frontend/node_modules/next/dist/docs/`** (o `AGENTS.md` da pasta avisa). A CLI/o build são a verdade —
não confie em memória nem em squiggle de editor.

## Boas práticas (não negociáveis)

### Fronteira Server/Client
- Layouts e páginas são **Server Components** por padrão. Use `'use client'` **só nas folhas
  interativas** (state, eventos, browser APIs, hooks) — nunca no topo da árvore. Empurre o `'use client'`
  pra baixo pra manter o máximo de UI estática/streamável.
- Providers (Query, Auth, Toaster) são um Client Component fino que envolve `{children}` no layout.

### Hooks
- **Dados via custom hooks** que encapsulam TanStack Query (`useCurrentRound`, `useWallet`,
  `useBetHistory`…). Nada de `fetch` solto em componente.
- **`useEffect` sempre com cleanup** (desconectar socket, cancelar `requestAnimationFrame`, remover
  listeners). Deps arrays corretos — não silencie o `react-hooks/exhaustive-deps` sem motivo escrito.
- **NUNCA coloque o multiplicador (60fps) em React state.** Seria tempestade de re-render. Use **dead
  reckoning**: um loop `requestAnimationFrame` lê o `elapsedMs` autoritativo (ref/store), calcula a curva
  via `@crash-game/curve` e escreve direto no DOM/SVG. O WS `round:tick` só **corrige** o `elapsedMs`;
  `round:crashed` é o único override absoluto (ver ADR 0016 — a curva é **não-autoritativa**).

### Estado: server vs client
- **TanStack Query** = tudo que vem de REST (rounds/current, history, bets/me, leaderboard, wallet/me).
- **Zustand** = estado efêmero/cliente (fase da rodada, status de conexão WS, aposta otimista, prefs/som).
- **WS faz patch do cache do Query** via `queryClient.setQueryData` (ex.: `bet:updated`/`balance:updated`)
  — não dispare refetch a cada evento.

### Auth (OIDC PKCE)
- Keycloak realm é **public client + PKCE** → fluxo 100% no browser (`oidc-client-ts`). **Não** usar
  NextAuth (quer confidential/server). `player_id` nunca vai no body — o backend tira do `sub` do JWT.
- Anexar o access token como **`Authorization: Bearer`** no REST (via Kong) e como **`auth.token`** no
  handshake do socket.io (o backend lê `handshake.auth.token`).

### Dinheiro & multiplicador
- Dinheiro no fio é **`number` em centavos**; multiplicador é **inteiro ×100**. Formate só na borda
  (`formatBRL`, `formatMultiplier` em `lib/utils.ts`). Nunca faça aritmética de dinheiro com float na UI.

### Componentes & UI
- Padrão shadcn/`cva` p/ variantes; tipados (sem `any`), `forwardRef` quando precisar de ref.
- **Regra de ouro do design:** o painel de aposta/cashout é **inline e sempre visível — NUNCA modal**.
  Modais só p/ ações não-críticas no tempo (depositar, sacar, verify, settings).
- **Dark sempre**, tokens do `globals.css` (`bg-base`, `bg-surface`, `text-fg`, `text-muted`,
  `text-primary`, `border-line`, `shadow-glow`…). Verde neon **só em acento**.
- **Mobile-first / responsivo desde o primeiro componente** — não é retrofit.
- **a11y:** labels, foco visível, navegação por teclado, `aria-*` onde couber.

### Testes
- Unit (lógica pura/hooks) com bun/Vitest. **Playwright** (e2e de browser) é F7 — pode rodar contra a
  stack determinística `bun run docker:e2e` (crash fixo 2,00x). Storybook acompanha os componentes (F2).

## Escopo travado do design (decisões do Lucas)

Fonte visual: `frontend/_design/crash-design-system.html` (export do claude.ai/design) + screenshots em
`frontend/_design/screenshots/`. O design tem switchers de exploração que **NÃO** vão pro produto:
- **Layout:** só **"Apostas à esquerda"** (layout A). Não implementar o switcher nem o "Curva ampla".
- **Curva:** só o estilo **"Linha"**. Não implementar Área/Neon nem o switcher.
- **Settings:** **sem** toggle de "notificações" e **sem** "reduzir animação". Manter os demais
  (som master, som de aposta/cashout/crash, volume, exibir fórmula da curva).
- **Fontes:** Space Grotesk (display/headings/botões), JetBrains Mono (números/multiplicador/saldo),
  Inter (corpo).
- **Login/registro:** NÃO são telas React — são **theme custom do Keycloak** (`docker/keycloak/themes/`),
  sobe zero-manual via `loginTheme` no realm. Telas React: Landing, Lobby (só "Crash/Avião" ativo), Jogo.

## Estrutura de pastas

```
src/
  app/            # rotas (App Router), layout, providers, páginas
  components/     # ui/ (primitivos shadcn) + features (game/, wallet/, …)
  hooks/          # custom hooks (dados + realtime + dead-reckoning)
  lib/            # api client, env, query keys, utils, socket
  stores/         # Zustand
```

Imports absolutos via `@/*`. Um conceito por arquivo; nomes descritivos dispensam comentário (comentário
só em lógica densa/regra de negócio — mesma regra do backend).
