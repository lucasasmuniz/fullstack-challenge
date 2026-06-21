# Crash Game 🎮

Plataforma de um **crash game** multiplayer em tempo real: um multiplicador sobe a partir de `1.00x`
e crasha num ponto pré-determinado e **verificável** (provably fair); o jogador aposta na janela de
apostas e precisa sacar antes do crash para ganhar `aposta × multiplicador`.

O backend são dois serviços NestJS (**Game** e **Wallet**) sobre Bun, comunicando-se de forma
**assíncrona via SQS**, atrás de um **API Gateway Kong**, com **WebSocket** para o tempo real,
autenticação via **Keycloak (OIDC)** e precisão monetária em centavos inteiros.

> Documento de **entrega**. Os requisitos originais do desafio estão em [`REQUISITOS.md`](./REQUISITOS.md).

## Status

| Parte | Estado |
| --- | --- |
| **Backend** (Game + Wallet, saga, provably fair, WebSocket, bônus) | ✅ completo |
| **Infra** (`docker:up` zero-manual, CI, observabilidade) | ✅ completo |
| **Frontend** (UI do jogo) | ⏳ próxima fase — backend verde ponta-a-ponta primeiro |

## Setup

**Pré-requisitos:** Bun ≥ 1.x e Docker + Docker Compose.

```bash
git clone <repo> && cd fullstack-challenge
bun install
bun run docker:up      # sobe tudo, zero passo manual
```

`docker:up` é **zero-manual e não precisa de `.env`**: o `docker-compose.yml` já injeta todas as
variáveis (valores de dev). As migrations rodam no boot de cada serviço (`migrator.up()`) e o usuário
de teste `player` já sobe com a carteira criada e **financiada com R$ 1.000,00** (via migration,
evento `initial`). Realm do Keycloak, rotas do Kong e filas do SQS são importados automaticamente.

**Rodar um serviço fora do Docker** (opcional, para desenvolver): copie o `.env.example` — que já vem
com defaults de dev apontando para `localhost` — e suba só a infra no Docker:

```bash
cp services/games/.env.example services/games/.env
cp services/wallets/.env.example services/wallets/.env
docker compose up -d postgres valkey localstack keycloak   # só a infra
cd services/games && bun run dev                            # idem para wallets
```

Toda variável é validada por `zod` no boot (fail-fast: o serviço não sobe com env faltando ou
inválida). Os `.env.example` documentam **todas** as variáveis; só as URLs são obrigatórias, o resto
tem default seguro.

| Recurso | URL | Notas |
| --- | --- | --- |
| API (Kong) | `http://localhost:8000` | **único** ponto de entrada: `/games/*`, `/wallets/*` |
| Swagger | `http://localhost:8000/games/docs` · `/wallets/docs` | OpenAPI (“Try it out”) |
| Keycloak | `http://localhost:8080` | `admin`/`admin`; realm `crash-game` |
| Grafana | `http://localhost:3001` | dashboards de RTP/volume/latência |
| Prometheus | `http://localhost:9090` | métricas |

**Usuário de teste:** `player` / `player123` (client `crash-game-client`, public + PKCE).

Os serviços Game/Wallet **não** expõem porta no host — só são acessíveis via Kong, então auth e
rate-limiting não podem ser contornados. Postgres, Valkey, LocalStack e Keycloak ficam expostos para
os scripts locais (migrations/seed/testes).

## Arquitetura

```
Frontend ── HTTP/WS ──▶ Kong (8000) ──▶ Game Service ──┐
                                    └──▶ Wallet Service ─┤
                                                         ├─ PostgreSQL (games | wallets)
   Game ◀──── SQS (LocalStack) ────▶ Wallet             ├─ SQS  (saga de dinheiro)
   Valkey: leader lease · WS fan-out · rate limit       └─ Keycloak (OIDC)
```

Dois **bounded contexts** com separação DDD (`domain → application → infrastructure → presentation`):

- **Game** — ciclo de vida da rodada, apostas, provably fair, engine em tempo real e WebSocket.
  Padrão **CQRS + outbox/inbox**: estado persistido + domain events para projeções/WS.
- **Wallet** — dona única do saldo. **Event sourcing**: os eventos do ledger são a fonte da verdade;
  o saldo é uma projeção.

Os serviços **não compartilham banco** e só se falam por mensagens (SQS). Detalhes densos por
contexto: [Game](./services/games/GUIDELINE.md) · [Wallet](./services/wallets/GUIDELINE.md) ·
[Packages compartilhados](./packages/GUIDELINE.md).

## Fluxos

A engine roda em loop: `BETTING` (janela de apostas) → `RUNNING` (multiplicador sobe) → `CRASHED`
(revela seed) → `SETTLED` → próxima rodada. O dinheiro **nunca** se move de forma síncrona no
request: o `POST /bet` só cria a aposta em `PENDING_FUNDS` e dispara a saga.

**Aposta vencedora (cashout):**
```
POST /games/bet → Bet(PENDING_FUNDS) + outbox DebitFunds ─SQS▶ Wallet debita
   ◀─ FundsDebited ── Bet→CONFIRMED          (saldo cai)
[multiplicador subindo] POST /games/bet/cashout → payout = aposta × mult atual
   → outbox CreditFunds ─SQS▶ Wallet credita ─ FundsCredited ── Bet→CASHED_OUT   (saldo sobe)
```

**Aposta perdida (crash):**
```
POST /games/bet → … → Bet→CONFIRMED (saldo cai)
[jogador não saca] crash → settlement marca CONFIRMED→LOST   (débito mantido, sem crédito)
```

**Saldo insuficiente:** `POST /bet` retorna `201` (PENDING_FUNDS) — o débito é assíncrono. A Wallet
recusa (`FundsDebitRejected`) e a aposta vira **`REJECTED`**; o saldo nunca fica negativo.

**Late-debit (compensação):** se o débito confirma **depois** de a rodada já ter terminado, a aposta
nunca jogou → vira `REFUNDED` e a Wallet recebe um `CreditFunds(reason=refund)`.

**Auto-cashout:** o jogador define `autoCashoutTargetX100` ao apostar; o líder saca sozinho no alvo
quando o multiplicador o cruza (payout determinístico = `aposta × alvo`).

**Auto-bet:** sessão server-side (`POST /games/autobet`) que aposta a cada rodada por estratégia
(`FIXED`/`MARTINGALE`) com auto-cashout no alvo e freios (`stopLoss`, `budget`, `stopWin`,
`maxRounds`). Resiliente a aba fechada — roda no servidor, dirigida pelo líder.

**Depósito / saque self-service** (decisão de design, ver abaixo): o jogador recarrega ou retira da
própria carteira via REST, para o gameplay não travar quando o saldo zera.

## API REST

Tudo via Kong (`http://localhost:8000`). `player_id` vem **sempre** do `sub` do JWT, nunca do body.

### Game — `/games/*`

| Método | Rota | Auth | Descrição | Erros |
| --- | --- | --- | --- | --- |
| `GET` | `/games/rounds/current` | — | Rodada atual + apostas | — |
| `GET` | `/games/rounds/history` | — | Histórico paginado | — |
| `GET` | `/games/rounds/:id/verify` | — | Dados de verificação provably fair | `400` id inválido, `404` |
| `POST` | `/games/bet` | ✅ | Aposta na rodada atual (`PENDING_FUNDS`) | `409` fora da fase / dupla · `422` fora do range · `400` body |
| `POST` | `/games/bet/cashout` | ✅ | Saca no multiplicador atual (server-authoritative) | `404` sem aposta · `409` fora de RUNNING / redundante |
| `GET` | `/games/bets/me` | ✅ | Histórico paginado do jogador | — |
| `POST` | `/games/autobet` | ✅ | Inicia sessão de auto-bet (1 ativa/jogador) | `409` já ativa · `422` config inválida |
| `GET` | `/games/autobet/me` | ✅ | Sessão de auto-bet mais recente (ou null) | — |
| `POST` | `/games/autobet/stop` | ✅ | Para a sessão ativa | `409` nenhuma ativa |
| `GET` | `/games/leaderboard?period=24h\|week` | — | Top jogadores por lucro líquido | `400` period inválido |

### Wallet — `/wallets/*`

| Método | Rota | Auth | Descrição | Erros |
| --- | --- | --- | --- | --- |
| `POST` | `/wallets` | ✅ | Cria a carteira do jogador | `409` já existe |
| `GET` | `/wallets/me` | ✅ | Saldo do jogador | `404` sem carteira |
| `POST` | `/wallets/deposit` | ✅ | Depósito (idempotente por `Idempotency-Key`) | `400` key/valor inválido · `409` reuso de key com valor diferente |
| `POST` | `/wallets/withdraw` | ✅ | Saque (respeita saldo ≥ 0) | `409` saldo insuficiente / reuso de key |

> **Crédito/débito do jogo não são REST** — fluem só pela saga SQS (liquidação cross-service).
> `deposit`/`withdraw` são uma feature **intencional e distinta**: a carteira mexendo no **próprio**
> dinheiro (intra-contexto), exposta via REST para o jogador recarregar/sacar fora do jogo e manter o
> gameplay dinâmico — sem precisar reiniciar containers/seed quando o saldo zera. São dinheiro
> fictício, idempotentes por `Idempotency-Key`, e continuam sendo eventos auditáveis do ledger
> (`reason=deposit|withdrawal`).

## Eventos WebSocket (server → client)

Conexão só para push em tempo real; toda ação do jogador é REST. Fan-out entre instâncias via adapter
Valkey. Eventos **públicos** (sala de espectadores) e **privados** (sala `user:{sub}`, autenticado):

| Evento | Quando | Payload (resumo) |
| --- | --- | --- |
| `round:opened` | nova rodada (BETTING) | `roundId`, `serverSeedHash`, `publicSeed`, `bettingEndsAt` |
| `round:started` | rodada vira RUNNING | `roundId`, `startedAt`, `growthRate` |
| `round:tick` | resync periódico | `elapsedMs` (autoritativo), `multiplierX100` |
| `round:crashed` | crash | `crashPointX100`, **`serverSeed`** (revelado), `publicSeed` |
| `round:settled` | apostas liquidadas | `roundId`, `settledAt` |
| `bet:placed` | entra aposta na rodada | `betId`, `username`, `amountCents`, `status` |
| `bet:updated` | transição (confirm/reject/cashout) | `betId`, `status`, `cashoutMultiplierX100?`, `payoutCents?` |
| `balance:updated` | saldo mudou (privado) | `balanceCents`, `currency` |

Sincronização do multiplicador por **dead reckoning**: a autoridade é o `elapsedMs` desde
`startedAt`; o cliente anima pela fórmula da curva. `round:crashed` é o único override absoluto e
nunca revela o `serverSeed`/`crashPoint` antes da hora.

## Decisões de arquitetura & trade-offs

**Precisão monetária — centavos inteiros (`bigint`), nunca float.** VO `Money` imutável e
não-negativo; `floor` no payout a favor da casa. Defesa em profundidade: invariante no agregado **e**
`CHECK (balance_cents >= 0)` no banco.

**Comunicação assíncrona via SQS, fluxo de dinheiro como saga.** `PlaceBet` grava
`Bet(PENDING_FUNDS)` + outbox `DebitFunds` na **mesma transação**; a Wallet responde
`FundsDebited`/`FundsDebitRejected`. **Exactly-once** via **outbox transacional** (relay com backoff,
`FOR UPDATE SKIP LOCKED`, sem CDC) + **inbox idempotente** por `messageId`/`(reason, correlation_id)`.
*Trade-off:* consistência eventual entre serviços — o saldo “pisca” alguns ms até o débito confirmar;
coberto pelos eventos de WS.

**Wallet event-sourced; Game state-stored.** Dinheiro merece ledger auditável e reconstruível (ES); a
engine não precisa de ES — estado + domain events bastam e são mais simples. Híbrido deliberado em vez
de ES em todo lugar.

**Concorrência otimista por `version`.** Wallet: `UNIQUE(wallet_id, version)`. Bet: `nativeUpdate`
com fence `WHERE version = N-1`; conflito → retry/erro, nunca segunda liquidação. “1 aposta por
jogador/rodada” e “1 carteira por jogador” são `UNIQUE` no banco.

**Engine com 1 líder — leader lease (Valkey) + fencing por `Round.version`.** Só o líder roda o loop,
com step-down e recovery no boot; o fencing é a correção real, o lease só evita trabalho duplicado.
Liquidação é um **bulk `UPDATE CONFIRMED→LOST`** inline (sem mover dinheiro — perder = o débito já
ocorreu). *Trade-off:* réplicas do Game ficam em standby para a engine (REST/WS escalam normalmente).

**Cashout server-authoritative.** O multiplicador vem do relógio do servidor, nunca do payload; o
crash usa o `crashPoint` **imutável** derivado da semente, nunca `Date.now()` no disparo do timer.

**Auth validada na app (JWKS).** O guard global re-valida o JWT via JWKS do Keycloak (RS256 fixo,
`iss` + `azp` + `typ`), secure-by-default com `@Public()` para rotas abertas. O Kong faz só
roteamento + rate-limiting — a autorização fica versionada com o código e testável.

**Kong DB-less + rate-limiting (Valkey).** Limites por IP, mais frouxos na leitura (polling) que na
escrita; `fault_tolerant` (Valkey fora do ar → falha-aberto, não derruba o jogo).

## Provably fair

`crashPoint = f(HMAC-SHA256(serverSeed, publicSeed))` com house edge, sobre uma **hash chain reversa**
(estilo bustabit). O `serverSeedHash` é publicado no início (commit) e a `serverSeed` revelada só após
o crash — barreira no domínio que **lança** se a seed for lida antes. O `publicSeed` vem de um beacon
externo (drand), com fallback CSPRNG offline, commitado antes / revelado depois (anti pré-computação).
Qualquer um recomputa via `GET /games/rounds/:id/verify`. A **curva é não-autoritativa**: `Math.exp/log`
não são bit-determinísticos entre CPUs, então a fórmula (compartilhada com o frontend) só anima; a
autoridade é o inteiro derivado da semente.

## Testes

| Suíte | Onde | Cobre |
| --- | --- | --- |
| **Unit — domínio** | `services/*/tests/unit`, `packages/*/tests` | Round (lifecycle/invariantes), Bet (cashout/status/limites), Wallet (crédito/débito/saldo/precisão/fold), Provably fair (crash determinístico + hash chain), Money, sagas, scheduler |
| **E2E — API/persistência** | `services/*/tests/e2e` | Rotas HTTP + regras (aposta dupla, fora da fase, range, auth), saga no nível de repo (confirm/reject/refund, fencing, idempotência) |
| **System — cross-service** | `tests/system` | Ponta-a-ponta via Kong + SQS: aposta→cashout→saldo · aposta→crash→LOST · **saldo insuficiente→REJECTED** · auto-cashout · auto-bet |

Fluxos de erro testados: saldo insuficiente, aposta dupla, aposta fora da fase de apostas, cashout sem
aposta / fora de RUNNING / redundante, valor fora do range, body inválido, sem token, reuso de
`Idempotency-Key` com valor diferente.

```bash
bun test               # unit (domínio) — packages + services/*/tests/unit
bun run test:e2e       # e2e por serviço (sobe AppModule no processo; precisa da infra de pé)
bun run e2e:system     #  sobe a stack determinística + seed + roda o system E2E
bun run docker:e2e:down  # derruba a stack do e2e
```

O `e2e:system` usa um override (`docker-compose.e2e.yml`) com **crash fixo em 2,00x**
(`GAME_FIXED_CRASH_X100`) para tornar o fluxo determinístico (sem flakiness por aleatoriedade).

**CI (GitHub Actions)** roda em todo push/PR, em três jobs: `quality` (lint + typecheck + unit),
`e2e` (sobe a infra e roda os e2e por serviço) e `system` (sobe a stack completa via `docker:e2e` +
seed + system E2E). Os testes novos do fluxo cross-service já entram no job `system`.

## Bônus implementados

Outbox/inbox transacional · auto-cashout · auto-bet (Martingale + stop-loss/budget/max-rounds) ·
observabilidade (OpenTelemetry + Prometheus + Grafana) · seed determinística para e2e · leaderboard
(24h/semana) · rate limiting (Kong) · CI (GitHub Actions).

## Processo de desenvolvimento

Projeto construído com um workflow deliberado de desenvolvimento assistido por IA (humano decide e
revisa, agentes implementam por etapa). O raciocínio, as decisões e o log de sessões estão em
[`docs/AI_WORKFLOW.md`](./docs/AI_WORKFLOW.md).
