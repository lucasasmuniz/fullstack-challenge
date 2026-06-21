# Game Service — GUIDELINE

> Contexto denso para o agente que for codar este serviço. Leia junto com
> `docs/guidelines/DEVELOPMENT_GUIDELINE.md`.

## Bounded context

O **jogo**: ciclo de vida da rodada, apostas, lógica de crash, provably fair, engine em tempo real
e WebSocket. Padrão: **CQRS + Outbox/Inbox** (estado persistido + domain events + read models).

Porta direta: `4001`. Via Kong: `http://localhost:8000/games/*`. DB: `games`.

## Agregados / entidades

**`Round`** (agregado raiz). Estados: `BETTING` → `RUNNING` → `CRASHED` → `SETTLED`.
- `crash_point` (inteiro × 100) gerado por provably fair **antes** das apostas; `server_seed_hash`
  publicado no início (commit), `server_seed` revelado após o crash (barreira de revelação que **lança**
  se lido antes do crash).
- Invariantes: transições válidas só na ordem; `canAcceptBets()` só em `BETTING`; `canCashout()` só em
  `RUNNING`.

**`Bet`** (**agregado separado** — ADR 0012; referencia a rodada só por `roundId`). Estados:
`PENDING_FUNDS` → `CONFIRMED` | `REJECTED` → `CASHED_OUT` | `LOST`.
- Invariantes locais: valor entre min (`1,00`) e max (`1.000,00`) — limites **injetados** (config);
  cashout só de `CONFIRMED` (1ª linha anti dupla-liquidação); cashout ≤ `crash_point`; `version` para
  concorrência otimista.
- Invariante **cross-aggregate** "1 aposta por jogador por rodada" → `UNIQUE(round_id, player_id)` no
  **banco** (Etapa 5); **não** é imposta no domínio (agregados separados não enxergam um ao outro).
- `payout = floor(amount_cents × multiplier / 100)` (`Money.multipliedBy`; floor a favor da casa). O
  `multiplier` é **autoridade do servidor** (vem do `Round`, nunca do payload — ADR 0014).

## Domain services

- **`ProvablyFairService`** — gera `crash_point` a partir das seeds (HMAC-SHA256, hash chain,
  house edge) e expõe `verify()` para o jogador conferir rodadas passadas.
- **`CrashCurve`** — função pura, no pacote compartilhado **`@crash-game/curve`** (Game e frontend usam a
  **mesma** fórmula; divergência quebra a sync do multiplicador):
  ```
  multiplier(elapsedMs) = floor(100 · e^(CRASH_GROWTH_RATE · elapsedMs / 1000))         // inteiro ×100 (t=0 → 100 = 1.00x)
  elapsedFor(multiplierX100) = ln(multiplierX100 / 100) / CRASH_GROWTH_RATE · 1000      // inversa, ms
  ```
  `CRASH_GROWTH_RATE` é env (mesmo valor server↔client). A curva é **NÃO-autoritativa** (ADR 0016):
  `Math.exp/log` não são bit-determinísticos entre arquiteturas, então ela só **anima**. A **autoridade é
  o `crashPointX100` derivado da semente** (inteiro exato); o crash é agendado por `elapsedForMultiplier`,
  mas a transição usa o crashPoint imutável (nunca `Date.now()` — guardrail do drift do `setTimeout`).
- **`RoundScheduler`** (application service, não domínio) — loop autoritativo:
  betting → run → crash → settle → próxima rodada. **Leader lease** no Valkey (1 runner) + **fencing por
  `Round.version`** no save (a correção; ADR 0015) + **step-down** + **recovery no boot** (rodada presa).
  Timings via env: `BETTING_WINDOW_MS`, `TICK_INTERVAL_MS`, `CRASH_GROWTH_RATE`, `INTER_ROUND_DELAY_MS`,
  `SCHEDULER_LEASE_TTL_MS` (nada hardcoded).
- **Cadeia de seeds** (ADR 0013): cold storage (`seed_chain`/`seed_chain_seed`, PK composta) = fonte da
  verdade (consumo reverso O(1)); buffer Valkey (`LPOP`) = só **candidato** (otimização); o **consumo é
  atômico com o insert da rodada** no `RoundOpener` (mesma tx → sem seed órfã). Geração O(N) roda em
  **worker thread** (não trava o event loop). `publicSeed` vem de **beacon externo** (drand, ADR 0017),
  commitado antes / revelado depois (anti-pré-computação), com fallback CSPRNG offline. `round_number`
  via **sequence** Postgres.

`payout = floor(amount_cents · multiplier / 100)` — arredondamento **floor** (a favor da casa), com `Money`.

## API REST

| Método | Rota | Auth | Descrição |
| --- | --- | --- | --- |
| GET | `/games/rounds/current` | Não | Rodada atual + apostas |
| GET | `/games/rounds/history` | Não | Histórico paginado |
| GET | `/games/rounds/:id/verify` | Não | Dados de verificação provably fair |
| GET | `/games/bets/me` | Sim | Apostas do jogador (paginado) |
| POST | `/games/bet` | Sim | Apostar na rodada atual |
| POST | `/games/bet/cashout` | Sim | Sacar no multiplicador atual |

`player_id` sempre do `sub` do JWT — nunca do body.

## WebSocket (server → client)

Eventos: `round.betting_started`, `round.started`, `round.tick`, `round.crashed` (+ verify),
`bet.placed`, `bet.cashed_out`, `balance.updated`. Fan-out multi-instância via adapter Valkey
(pub/sub). Sync do multiplicador: cliente calcula pela fórmula a partir do `startedAt`; servidor
manda ticks de resync e é a autoridade do crash.

## Saga com a Wallet (dinheiro via SQS)

- **Aposta**: `Bet(PENDING_FUNDS)` + outbox `DebitFunds{betId}` (mesma tx) → SQS → Wallet →
  `FundsDebited` ⇒ `CONFIRMED` | `FundsDebitRejected` ⇒ `REJECTED`. Só `CONFIRMED` joga.
- **Cashout**: `payout` → outbox `CreditFunds{cashoutId}` → Wallet → `FundsCredited` ⇒ `CASHED_OUT`.
- **Crash**: aposta `CONFIRMED` não sacada ⇒ `LOST` (dinheiro já debitado).
- **Compensação**: falha de crédito / rodada cancelada ⇒ evento de refund.
- Exactly-once: outbox transacional + inbox idempotente por id.
- Relay: worker poller (`@crash-game/messaging`) publica a outbox no SQS com backoff/`attempts`; sem CDC.

## Tabelas (DB `games`)

- `round`, `bet` (ver `BACKEND_PLAN.md` › Modelo de dados), `inbox`, `outbox`.
- Read models: `leaderboard_24h` (materialized view); history e bets/me via query indexada.

## Três tipos de evento (não confundir)

- **Domain events** (in-process) → projeções + WebSocket.
- **Integration events** (SQS+outbox) → comunicação com a Wallet.
- (na Wallet, eventos são event-sourced — fonte da verdade.)
