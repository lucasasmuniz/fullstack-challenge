# Game Service — GUIDELINE

> Contexto denso do serviço **Game**, para humanos e agentes. Cobre padrões, agregados, persistência,
> fluxos, eventos e testes. Leia junto com o [README](../../README.md) (visão geral) e o
> [GUIDELINE dos packages](../../packages/GUIDELINE.md).

## Bounded context

O **jogo**: ciclo de vida da rodada, apostas, lógica de crash, provably fair, engine em tempo real e
WebSocket. Acessível **só via Kong** (`http://localhost:8000/games/*`); não publica porta no host.
Banco próprio: `games` (não compartilha com a Wallet).

**Padrão de persistência: state-stored + domain events (CQRS-ish).** O estado dos agregados é gravado
diretamente (uma linha por `round`/`bet`), com **concorrência otimista por `version`**. As mutações
emitem **domain events** in-process que alimentam projeções, WebSocket e a outbox. **Não é event
sourcing** (isso é a Wallet) — aqui o estado é a fonte da verdade; os eventos são side-output. A
comunicação com a Wallet é assíncrona, via **outbox/inbox transacional sobre SQS** (saga).

## Agregados

### `Round` (raiz)
Máquina de estados estrita: `BETTING → RUNNING → CRASHED → SETTLED`. Cada transição valida a ordem
(transição inválida → `Result.fail`, sem mutar) e incrementa `version`.
- `crashPointX100` (inteiro ×100) é derivado por provably fair **no `open()`**, **antes** das apostas, e
  é **imutável**. É a autoridade do crash (a curva só anima).
- **Commit-reveal:** `serverSeedHash` é público desde o início; `serverSeed` só é revelável após o
  crash — `getServerSeed()` **lança** se chamado em `BETTING`/`RUNNING`. Garante que o resultado foi
  pré-fixado e não manipulado após as apostas.
- Invariantes: `canAcceptBets()` só em `BETTING`; `canCashout()` só em `RUNNING`.
- Seam de teste: `Round.open(..., fixedCrashPointX100?)` força o crash (B5/e2e determinístico) — só
  ativado pela env `GAME_FIXED_CRASH_X100` (test-only).

### `Bet` (agregado **separado** do Round)
Referencia a rodada só por `roundId` — os dois agregados não se enxergam. Estados:
`PENDING_FUNDS → CONFIRMED | REJECTED`, e de `CONFIRMED → CASHED_OUT | LOST`; `PENDING_FUNDS → REFUNDED`
(compensação de late-debit).
- Invariantes locais: valor em `[min, max]` (limites injetados por config); `cashout` só de `CONFIRMED`
  (1ª linha anti dupla-liquidação); multiplicador inteiro ≥ 1.00x e ≤ `crashPointX100`; `version` para
  concorrência otimista.
- Invariante **cross-aggregate** "1 aposta por jogador por rodada": **não** é imposta no domínio
  (agregados separados) → `UNIQUE(round_id, player_id)` no banco (violação → `BetAlreadyExistsError` → 409).
- `payout = floor(amount_cents × multiplierX100 / 100)` via `Money.multipliedBy` (floor a favor da casa).
  O multiplicador é **autoridade do servidor** (vem do `Round`, nunca do payload do cliente).

### `AutoBetSession` (Process Manager — bônus auto-bet)
Estado server-side de uma sessão de aposta automática. `FIXED` ou `MARTINGALE`, com freios `stopLoss`,
`budget`, `stopWin`, `maxRounds`. Dirigido pelo líder: a cada `openRound` decide/coloca a aposta, a cada
`settleRound` reconcilia o desfecho (win/loss/**SKIPPED_ROUND** quando a aposta não confirmou a tempo —
latência da saga não conta como perda). Idempotência por `lastProcessedRoundId`. Máx. 1 sessão `ACTIVE`
por jogador (índice único parcial). `net_result_cents` é assinado (P&L).

## Domain services

- **`ProvablyFairDomainService`** — `deriveCrashPoint(serverSeed, publicSeed, policy)` via
  `HMAC-SHA256` + house edge; `generateChain` (hash chain reversa de Lamport); `verify()` recomputa
  commitment + crash point + elo da cadeia para auditoria pública. Puro, sem I/O nem estado.
- **`@crash-game/curve`** (package compartilhado Game↔frontend) — `multiplierAt(elapsedMs, rate)` e a
  inversa `elapsedForMultiplier`. **NÃO-autoritativa:** `Math.exp/log` não são bit-determinísticos entre
  CPUs, então só anima/agenda; a autoridade do crash é o `crashPointX100` inteiro da semente.

## Engine — `RoundScheduler` (application service)

Loop autoritativo `BETTING → RUNNING → CRASHED → SETTLED → próxima`. **Apenas o líder roda** (leader
lease no Valkey, 1 runner). A correção real sob concorrência é o **fencing por `Round.version`** no save
(líder obsoleto → `RoundConcurrencyError` → step-down). Tem **recovery no boot** (retoma rodada presa) e
**step-down** (renovação do lease falha → solta e para). Durante `RUNNING` emite ticks de resync e roda o
**auto-cashout** (saca no alvo as apostas cujo `autoCashoutTargetX100` foi atingido). O crash usa o
`crashPointX100` **imutável** — nunca `Date.now()` no disparo do timer (guardrail do drift do `setTimeout`).
Timings via env (nada hardcoded): `BETTING_WINDOW_MS`, `TICK_INTERVAL_MS`, `CRASH_GROWTH_RATE`,
`INTER_ROUND_DELAY_MS`, `SCHEDULER_LEASE_TTL_MS`.

## Persistência (DB `games`)

- **Tabelas:** `round`, `bet` (state-stored, com `version`), `inbox` (dedup de mensagens), `outbox`
  (mensagens a publicar), `seed_chain` + `seed_chain_seed` (cold storage da cadeia, PK composta),
  `auto_bet_session`.
- **Fencing:** escrita de transição via `nativeUpdate ... WHERE id = ? AND version = N-1`; `affected !== 1`
  → `BetConcurrencyError`/`RoundConcurrencyError`. **Contrato load-bearing:** `markRoundLost` (bulk
  `CONFIRMED→LOST` no crash) **não** bumpa `version`, de propósito — deixa um auto-cashout "em voo"
  (alvo atingido antes do crash) vencer a corrida settle-vs-cashout via `saveWithOutbox` (não adicionar
  `status` ao WHERE desse update).
- **Cadeia de seeds:** cold storage é a fonte da verdade (consumo reverso O(1)); o buffer Valkey (`LPOP`)
  é só candidato/otimização. O consumo da seed é **atômico com o insert da rodada** (mesma tx no
  `RoundOpener` → sem seed órfã). Geração O(N) roda em **worker thread**. `publicSeed` vem de beacon
  externo (drand), commitado antes / revelado depois; fallback CSPRNG offline. `round_number` via
  sequence Postgres.
- **Read models (CQRS):** `/rounds/current|history` e `/bets/me` por query indexada; leaderboard via
  **covering index** (`(status, resolved_at) INCLUDE (...)`) para Index-Only Scan + cache Valkey curto.

## Fluxos

**Lifecycle da rodada (líder):** abre rodada (consome seed + insert atômico) → emite `round:opened` →
após `BETTING_WINDOW_MS`, `start()` → `round:started` + liga ticks/auto-cashout → no `crashPoint`,
`crash()` → `round:crashed` (revela seed) → `markRoundLost` (CONFIRMED→LOST) + reconcilia auto-bet →
`settle()` → `round:settled` → próxima.

**Saga de dinheiro (cross-service, ver também a GUIDELINE da Wallet):**
- **Aposta:** `POST /bet` → `Bet(PENDING_FUNDS)` + outbox `DebitFunds` (mesma tx) → SQS → Wallet debita →
  `FundsDebited` ⇒ `CONFIRMED` | `FundsDebitRejected` (saldo insuficiente) ⇒ `REJECTED`. Só `CONFIRMED` joga.
- **Cashout:** `POST /bet/cashout` (server-authoritative, sem body) → `payout` → outbox `CreditFunds` →
  Wallet credita → `FundsCredited` ⇒ `CASHED_OUT`.
- **Crash sem saque:** `CONFIRMED` não sacada ⇒ `LOST` (dinheiro já debitado, sem crédito).
- **Late-debit (compensação):** débito confirma depois de a rodada terminar ⇒ `REFUNDED` + `CreditFunds(refund)`.
- **Auto-cashout:** o líder saca no alvo durante `RUNNING` (payout determinístico = `aposta × alvo`),
  reusando `Bet.cashout` + `saveWithOutbox` (mesmo caminho de dinheiro do manual).
- **Exactly-once:** outbox transacional (relay com backoff/`attempts`, `FOR UPDATE SKIP LOCKED`, sem CDC)
  + inbox idempotente por `messageId`/`correlation_id (= betId)`.

## Comunicação entre serviços (Game ↔ Wallet)

Os dois serviços **não compartilham banco nem se chamam por REST**. Toda interação é **assíncrona via
SQS**, com contratos versionados em `@crash-game/contracts` (validados por zod nas duas pontas — payload
incompatível falha no parse e vai para a DLQ, nunca corrompe dinheiro em silêncio).

```
Game ──  DebitFunds / CreditFunds  ──▶ [wallet-inbox] ──▶ Wallet
Game ◀── FundsDebited / FundsDebitRejected / FundsCredited ◀── [game-inbox] ◀── Wallet
```

| Direção | Fila | Mensagens |
| --- | --- | --- |
| Game → Wallet (comandos) | `wallet-inbox` | `DebitFunds`, `CreditFunds` |
| Wallet → Game (resultados) | `game-inbox` | `FundsDebited`, `FundsDebitRejected`, `FundsCredited` |

- **Envelope** (`@crash-game/contracts`): `{ messageId, type, occurredAt, payload }`. `messageId` é a
  chave de idempotência do consumidor — é o **id da linha da outbox**, estável entre retries do relay.
- **Padrão:** quem produz grava na **outbox** na mesma tx do efeito de domínio; o **relay** (poller)
  publica no SQS; quem consome registra na **inbox** (dedup por `messageId`) e aplica — tudo transacional
  → **exactly-once** efetivo sobre entrega at-least-once.
- **`correlationId` da saga = `betId`** (idempotência da Wallet por `(reason, correlationId)`); `bet`,
  `cashout` e `refund` do mesmo `betId` são movimentos distintos.
- **Por quê assíncrono:** desacopla os serviços (um pode cair que a mensagem espera na fila), absorve
  picos e evita commit distribuído (2PC). *Trade-off:* consistência eventual — a aposta fica
  `PENDING_FUNDS` alguns ms até o débito confirmar (coberto pelos eventos de WS).

O **fluxo de negócio** sobre esse canal (aposta/cashout/crash/refund) está em [Fluxos](#fluxos); a visão
do lado da Wallet, na [GUIDELINE da Wallet](../wallets/GUIDELINE.md).

## API REST

`player_id` vem **sempre** do `sub` do JWT, nunca do body. Erros de domínio → HTTP via exception filter.

| Método | Rota | Auth | Descrição | Erros |
| --- | --- | --- | --- | --- |
| GET | `/games/rounds/current` | — | Rodada atual + apostas | — |
| GET | `/games/rounds/history` | — | Histórico paginado | — |
| GET | `/games/rounds/:id/verify` | — | Verificação provably fair | `400` id, `404` |
| GET | `/games/bets/me` | ✅ | Apostas do jogador (paginado) | — |
| POST | `/games/bet` | ✅ | Aposta na rodada atual (`PENDING_FUNDS`) | `409` fase/dupla · `422` range · `400` body |
| POST | `/games/bet/cashout` | ✅ | Saca no multiplicador atual | `404` sem aposta · `409` não-RUNNING/redundante |
| POST | `/games/autobet` | ✅ | Inicia sessão de auto-bet | `409` já ativa · `422` config |
| GET | `/games/autobet/me` | ✅ | Sessão de auto-bet recente (ou null) | — |
| POST | `/games/autobet/stop` | ✅ | Para a sessão ativa | `409` nenhuma ativa |
| GET | `/games/leaderboard?period=24h\|week` | — | Top por lucro líquido | `400` period |

## WebSocket (server → client)

Push em tempo real; toda ação do jogador é REST. Fan-out multi-instância via adapter Valkey (pub/sub).
Eventos sempre emitidos **pós-commit** (nunca dentro da tx).

| Evento | Quando | Payload (resumo) |
| --- | --- | --- |
| `round:opened` | nova rodada (BETTING) | `roundId`, `serverSeedHash`, `publicSeed`, `bettingEndsAt` |
| `round:started` | vira RUNNING | `roundId`, `startedAt`, `growthRate` |
| `round:tick` | resync periódico | `elapsedMs` (autoritativo), `multiplierX100` |
| `round:crashed` | crash | `crashPointX100`, **`serverSeed`** (revelado), `publicSeed` |
| `round:settled` | apostas liquidadas | `roundId`, `settledAt` |
| `bet:placed` | entra aposta | `betId`, `username`, `amountCents`, `status` |
| `bet:updated` | transição da aposta | `betId`, `status`, `cashoutMultiplierX100?`, `payoutCents?` |

Sync do multiplicador por **dead reckoning**: a autoridade é o `elapsedMs` desde `startedAt`; o cliente
anima pela fórmula da curva. `round:crashed` é o único override absoluto.

## Três tipos de evento (não confundir)

- **Domain events** (in-process) → projeções + WebSocket.
- **Integration events** (SQS + outbox/inbox) → comunicação com a Wallet.
- (Na Wallet, os eventos são **event-sourced** — fonte da verdade. Aqui não.)

## Testes

- **Unit (`tests/unit`)** — domínio puro, sem I/O: `round` (lifecycle/invariantes/barreira da seed),
  `bet` (cashout/floor/status/dupla-liquidação), `provably-fair` (crash determinístico + hash chain +
  verify, com recomputação independente da fórmula), `auto-bet-session`/`auto-bet`/`auto-cashout`,
  `leader-lease`, `seed-buffer`, `drand-beacon`, `realtime-events`, `bet-saga`.
- **E2E (`tests/e2e`, `RUN_E2E=1`, precisa da infra)** — sobe o `AppModule` no processo: `bet-api`
  (regras HTTP: dupla, fase, range, auth, cashout), `bet-saga` (persistência: place atômico, fencing,
  inbox dedup, refund), `auto-bet-api`, `leaderboard-api`, `realtime`, `auth`, `round-repository`.
- **System (raiz `tests/system`, `bun run e2e:system`)** — cross-service via Kong + SQS, com crash fixo:
  aposta→cashout→saldo, aposta→crash→LOST, saldo insuficiente→REJECTED, auto-cashout, auto-bet.

## Padrões e regras

- **Erros como valor** (`Result<T,E>`) no domínio; exceptions só nas bordas (HTTP/messaging).
- **Dinheiro** sempre via `Money` (`bigint` centavos, sem float; floor a favor da casa).
- **Sem `any`, sem `!`** (definite-assignment); agregados com construtor privado + `reconstitute`.
- **Comentários mínimos**: JSDoc objetivo só em classes/lógica densa; nada de narração inline.
- **Config por env** (zod, fail-fast no boot); nada de timing/limite de negócio hardcoded.
