# AI Development Workflow & Session Log

## Para que serve este documento

Este projeto foi construído com um **workflow deliberado de desenvolvimento assistido por IA** —
não é "joguei um prompt e colei o resultado". Aqui registro **como pensei** durante o
desenvolvimento: as decisões, os trade-offs, quem fez o quê e por quê.

Se você é avaliador: leia este arquivo para entender o **raciocínio** e o **processo**, não só o
código final. Cada sessão de agente termina com uma entrada no log abaixo, em ordem cronológica,
descrevendo o que foi feito e por quê.

A filosofia é a mesma que a Jungle Gaming descreve: engenheiro e agentes de IA trabalham lado a
lado, com o humano decidindo, revisando e rejeitando output quando necessário — IA como copiloto,
não como piloto automático.

---

## Modelo de colaboração (papéis)

- **Humano (Lucas)** — dono das decisões. Define requisitos, revisa e questiona o output dos
  agentes, e aprova cada etapa.
- **Agente planejador** — uma única sessão de planejamento que produziu a arquitetura, o catálogo
  de requisitos, o modelo de dados, os ADRs e o roadmap por etapas (`docs/planning/BACKEND_PLAN.md`).
  Não escreve código de feature; define o caminho.
- **Agentes desenvolvedores** — **1 etapa cada**. Leem o plano + guideline + `GUIDELINE.md` do
  serviço, implementam só aquela etapa, escrevem os testes e o journal.
- **Agente revisor** — roda a cada 2 etapas e obrigatoriamente após as etapas de dinheiro (2 e 5).
  Avalia aderência ao plano, qualidade, segurança, precisão monetária, idempotência, erros e testes.

O roadmap completo das etapas (0 a 8) está em `docs/planning/BACKEND_PLAN.md`.

---

## Fases do desenvolvimento

| Fase | O que acontece | Artefatos |
| --- | --- | --- |
| **Planejamento** | Arquitetura, requisitos, modelo de dados, ADRs, roadmap por etapas | `docs/planning/`, `docs/adr/`, `docs/guidelines/`, `GUIDELINE.md` |
| **Execução (por etapa)** | Um dev agent implementa uma etapa + testes + journal | `services/`, `packages/`, `docs/journal/etapa-XX-*.md` |
| **Revisão (checkpoints)** | Agente revisor audita as etapas concluídas | `docs/reviews/review-etapas-XX-YY.md` |
| **Hardening & entrega** | README, security review, docker:up zero-manual | `README.md`, ajustes finais |

> Os artefatos **públicos da entrega** são este Session Log e os [ADRs](./adr/README.md) (`docs/adr/`).
> O planejamento (`docs/planning/`), os journals (`docs/journal/`), as revisões (`docs/reviews/`) e os
> guidelines internos são **material de trabalho do Lucas** — citados abaixo para dar contexto, mas
> mantidos fora do repositório.

---

## Journal vs Session Log (não confundir)

São dois artefatos com propósitos distintos:

- **Journal** (`docs/journal/etapa-XX-*.md`) — **mergulho profundo de cada etapa**: decisões
  detalhadas, trade-offs, testes escritos, explicação linha-a-linha quando útil. É **material de
  estudo pessoal do Lucas** e fica fora do histórico. Pode ser longo e didático.
- **Session Log** (este arquivo, abaixo) — **resumo cronológico curto**, uma entrada por sessão de
  agente, para o **avaliador** percorrer o projeto inteiro de cima e entender o raciocínio e o
  processo. **É commitado** e faz parte da entrega.

Regra prática: o trabalho denso vai no journal; o Session Log é a versão enxuta e pública.

### Template de entrada

```
### Sessão NN — <papel> — <título curto>
- **Data:** AAAA-MM-DD
- **Etapa(s):** <ex: Etapa 2 — Wallet> (ou "Planejamento")
- **O que foi feito:** <resumo objetivo do entregue>
- **Por quê / decisões:** <decisões tomadas e a razão; trade-offs>
- **Testes:** <o que foi testado e como; resultado — uma linha>
```

---

## Session Log

### Sessão 01 — Planejador — Arquitetura e roadmap do backend
- **Data:** 2026-06-16
- **Etapa(s):** Planejamento
- **O que foi feito:** Arquitetura completa do backend, catálogo de requisitos (R1–R13 obrigatórios +
  B1–B8 bônus, todos de backend), modelo de dados das duas bases, modelo da saga Game↔Wallet,
  estrutura de pastas e o roadmap em 9 etapas (0–8). Documentos de fundação: `BACKEND_PLAN.md`,
  `DEVELOPMENT_GUIDELINE.md`, os `GUIDELINE.md` de games e wallets, os ADRs 0001–0006 e o
  `AGENT_DISPATCH.md`.
- **Por quê / decisões:**
  - **Kong** como API Gateway (valida JWT na borda + rate limiting); equivalente AWS documentado.
  - **Híbrido**: Event Sourcing na Wallet (ledger append-only = auditoria perfeita de dinheiro) +
    CQRS+Outbox/Inbox no Game (estado efêmero, melhor com read models). ES completo em tudo seria
    caro/arriscado para 5 dias.
  - **SQS via LocalStack** (substitui RabbitMQ) e **Valkey** (estado do round, pub/sub do WebSocket,
    cache de leaderboard) — alinhados à stack da vaga.
  - **Dinheiro só em inteiro (centavos)**, multiplicador inteiro ×100, saldo nunca negativo,
    idempotência em todo movimento — princípios inegociáveis de dinheiro real.
  - **Erros**: Result (error-as-value) no domínio + exceptions técnicas nas bordas (filter + retry/DLQ).
  - **Crédito/débito do jogo só via SQS** (cross-service); **deposit/withdraw via REST** (intra-contexto).
  - **Testes**: Bun test (unit) + Testcontainers (integração/E2E).
- **Testes:** N/A (fase de planejamento; política de testes definida no guideline).

### Sessão 02 — Planejador — Refinamentos do Lucas e correção da curva
- **Data:** 2026-06-17
- **Etapa(s):** Planejamento
- **O que foi feito:** 5 refinamentos nos docs + adição do pacote `@crash-game/curve`. Validado cada
  um; corrigido um bug de unidade na fórmula da curva.
- **Por quê / decisões:**
  - **Fórmula da curva** travada em `@crash-game/curve` (mesma função no server e no client; server é a
    autoridade do crash). **Correção:** o forward passa a retornar o multiplicador **inteiro ×100**
    (removido um `/100` indevido) — antes conflitava com a comparação de crash (`multiplier ≥
    crash_point`, ambos ×100) e com o cálculo de payout.
  - **Payout** com arredondamento **floor** (a favor da casa): `floor(amount_cents · multiplierX100 / 100)`.
  - **deposit/withdraw** documentados como feature intencional (intra-contexto, REST), distinta da
    liquidação cross-service (só SQS).
  - **Timings configuráveis via env**; **relay da outbox** = worker poller com backoff (sem CDC).
- **Testes:** N/A (planejamento).

### Sessão 03 — Desenvolvedor — Etapa 0: Fundação (monorepo, infra, tooling)
- **Data:** 2026-06-17
- **Etapa(s):** Etapa 0 — Fundação
- **O que foi feito:** Infra trocada para a stack travada — removido RabbitMQ; adicionados LocalStack
  (SQS) e Valkey; bootstrap automático das filas (`wallet-inbox`/`game-inbox` + DLQs). Build Docker
  workspace-aware (context na raiz) para resolver `@crash-game/*`. Pacotes `@crash-game/*`:
  `typescript-config` e `eslint-config` (completos), `domain-kit` (Result, DomainError, DomainEvent,
  Entity, AggregateRoot, ValueObject + testes), e esqueletos de `money`/`curve`/`messaging`/`contracts`.
  Tooling no root (lint/typecheck/test). MikroORM: deps + preset compartilhado (`@crash-game/persistence`).
  ADR 0007 (guardrail do `@crash-game/curve`).
- **Por quê / decisões:**
  - **Scope `@crash-game`** (em vez de `@crash`): scope é um **namespace** (prefixo), não um serviço —
    cada `@crash-game/x` é um pacote independente e a audiência (front+back vs back+back) é definida
    por **quem importa**. Só o `@crash-game/curve` é consumido pelo frontend.
  - **Profundidade por etapa:** tooling + `domain-kit` implementados e testados; `money`/`curve`/
    `messaging`/`contracts` ficam esqueleto (preenchidos nas etapas donas). Respeita "1 etapa = 1 escopo".
  - **`domain-kit` "completo porém fino":** blocos de DDD (Result, Entity, AggregateRoot com domain
    events, ValueObject, DomainEvent, DomainError) mantidos enxutos (~20-40 linhas/base) para não virar
    framework.
  - **Config de env = híbrido:** schema **zod** valida `process.env` e o objeto `Env` **tipado** é
    entregue por **DI** (`@Inject(ENV)`), com **fail-fast no bootstrap**. Escolhido sobre `@nestjs/config`
    (tipagem forte com menos cerimônia) e sobre singleton (foge da DI/testes).
  - **Docker workspace-aware** já agora para de-riscar o R1; **env inline no compose** porque `.env` é
    gitignored e um clone limpo quebraria o `docker:up` zero-manual.
  - **Curva = Shared Kernel com guardrail** (ADR 0007): só math pura; seed/crash point/autoridade são
    server-only.
- **Testes:** `lint`/`typecheck`/`test` limpos; `docker:up` zero-manual com tudo healthy; `/health` via
  Kong nos 2 serviços; filas SQS criadas; Valkey PONG.

### Sessão 04 — Desenvolvedor — Etapa 1: Auth (JWKS) + Config de env + MikroORM infra-only
- **Data:** 2026-06-18
- **Etapa(s):** Etapa 1 — Auth na borda + MikroORM + Config (env)
- **O que foi feito:** Pacote `@crash-game/nestjs-kit` com a cola de auth/config: `JwksGuard` (valida JWT
  via `jose`/JWKS), `@CurrentUser`, `@Public`, `AuthModule.forRoot` (guard global secure-by-default) e
  `loadEnv`+`ENV` (zod valida `process.env`, fail-fast, entrega `Env` tipado por DI). Fiação dos 2
  serviços: schema zod de env, MikroORM **infra-only** (conexão + migrator no boot, zero entidades),
  guard global + `@Public()` no health, sonda `GET /{games,wallets}/auth/me` protegida. Keycloak com
  `KC_HOSTNAME` (issuer determinístico). **Hardening (chaos review):** validação de tipo de token
  (`typ=Bearer`), binding de cliente (`azp`), `AllExceptionsFilter` global, `clockTolerance`, cooldown do
  JWKS (anti-DoS). ADRs 0008/0009.
- **Por quê / decisões:**
  - **Validação JWKS na aplicação, Kong só roteia (ADR 0009):** descartado o plugin community do Kong
    (acopla infra frágil, ameaça o `docker:up`) e a chave fixa no realm (mata rotação). JWKS = rotação
    automática, zero segredo no repo.
  - **Guard global secure-by-default + `@Public()`:** as leituras do Game são públicas (anônimo assiste o
    jogo); auth é por-rota, e errar fecha (rota nova nasce protegida).
  - **MikroORM infra-only:** entidades/migrations de domínio são das Etapas 2–5.
  - **`@crash-game/nestjs-kit` (ADR 0008):** guard + decorator + env-loader idênticos nos 2 serviços →
    pacote compartilhado.
  - **Gotcha do issuer Docker:** issuer público (`localhost:8080`) ≠ host interno do JWKS
    (`keycloak:8080`); resolvido com 2 envs + `KC_HOSTNAME`. Healthcheck do Keycloak 26 vive na porta 9000.
- **Testes:** unit do kit (guard, `JoseJwtVerifier` válido/expirado/issuer/alg/typ/azp, `loadEnv`,
  filter); E2E por serviço (`/health` público; `/auth/me` 401 sem/inválido, 200+`sub` com token real do
  `player`). Verde no `docker:up` via Kong.

### Sessão 05 — Desenvolvedor — Etapa 2: Wallet Service (ledger event-sourced + Money + REST)
- **Data:** 2026-06-19
- **Etapa(s):** Etapa 2 — Wallet (dinheiro)
- **O que foi feito:** Pacote `@crash-game/money` (VO `Money` em `bigint`, sem float). Domínio Wallet
  **event-sourced**: agregado `Wallet` (create/credit/debit + `rebuild`/fold), domain events
  (`WalletCreated`/`FundsCredited`/`FundsDebited` = fonte da verdade). Persistência MikroORM:
  `wallet_event` (append-only, `UNIQUE(wallet_id,version)` + `UNIQUE(reason,correlation_id)`) + `wallet`
  (projeção, `CHECK(balance_cents>=0)`); repositório que faz append + projeção **na mesma transação**.
  REST `POST /wallets`, `GET /wallets/me`, `POST /wallets/deposit|withdraw` (Idempotency-Key). Migrations
  (schema + seed) e **pin do `id` do `player`** no realm → carteira financiada (1.000,00) zero-manual. ADR
  0010. **Chaos review (W1–W8):** achado crítico **W1** — handler tratava qualquer
  `UniqueConstraintViolation` como retry idempotente, mas a violação pode ser de `UNIQUE(wallet_id,
  version)` (concorrência), causando **falso 200** e perda de dinheiro; corrigido com retry loop que
  separa as duas causas. **W7:** idempotência escopada por carteira (`UNIQUE(wallet_id, reason,
  correlation_id)`). **W4/W3/W5:** rebuild valida continuidade de version, teto em `amountCents`, create
  concorrente → 409.
- **Por quê / decisões:**
  - **SQS adiado pra Etapa 5:** deposit/withdraw são intra-contexto e não precisam de messaging; os
    consumers só fazem sentido com o Game (Etapa 5).
  - **`Money` em `bigint`** (ADR 0005); `amountCents` na API como `number` (safe-integer), conversão só na
    borda — rigor no core sem atrito de `bigint` em JSON.
  - **Idempotência REST via `Idempotency-Key`** → `correlation_id` no ledger (checagem prévia + `UNIQUE`
    como rede de segurança); **seed determinístico** via pin do `id` no realm + migration (ADR 0010).
- **Testes:** unit (Money: precisão/guard; Wallet: create/credit/debit/insuficiente/fold/rebuild gap).
  Integração (round-trip append+fold, idempotência, concorrência otimista, isolamento por carteira). E2E
  REST (me, create→409, deposit retry idempotente, withdraw, insuficiente→409, validações, sem token→401).

### Sessão 06 — Desenvolvedor — Etapa 3: Domínio do Game (Round + Bet + Provably Fair)
- **Data:** 2026-06-19
- **Etapa(s):** Etapa 3 — Domínio do Game (puro, sem I/O)
- **O que foi feito:** `ProvablyFairDomainService` puro (hash chain reversa + public seed): `hashSeed`,
  `generateChain`, `deriveCrashPoint` (HMAC-SHA256, **BigInt** sem float, house edge via
  `instantBustDivisor`), `verify` e `verifyChainLink`. Agregado **`Round`** (`BETTING→RUNNING→CRASHED→
  SETTLED`, crash point derivado e imutável no `open()`, **barreira de revelação da `serverSeed`** que
  lança antes do crash, `version`). Agregado **`Bet`** separado (referencia `roundId` por ID): máquina de
  estados (`PENDING_FUNDS→CONFIRMED|REJECTED→CASHED_OUT|LOST`), payout `floor` via novo
  `Money.multipliedBy`, **guarda anti dupla-liquidação**, `autoCashoutTarget`, `version`. Domain events das
  duas raízes. ADRs 0011–0014.
- **Por quê / decisões:**
  - **Provably fair = hash chain + public seed:** crash é jogo de **rodada compartilhada** → client seed
    por jogador não modela; a cadeia prova a pré-determinação e o `publicSeed` anula pré-computação.
    **BigInt** porque `100·2^52` estoura o safe-integer do `number`. House edge = `1/instantBustDivisor`.
  - **Round e Bet agregados separados (ADR 0012):** um agregado é o limite real de transação; `Bet` dentro
    de `Round` causaria contenção sob muitos apostadores. "1 aposta/jogador/rodada" é cross-aggregate →
    `UNIQUE(round_id, player_id)` no banco (Etapa 5).
  - **Cold storage da cadeia = exigência matemática:** consumo reverso é O(1) por índice; "andar" a cadeia
    por hash seria inverter o SHA-256 (pre-image).
  - **Cashout server-authoritative** + anti dupla-liquidação (máquina de estados + `version`) e anti
    parameter-tampering (`crashPointX100` vem do `Round`, nunca do payload).
- **Testes:** unit determinísticos (seeds fixas, `now`/`occurredAt` injetados): provably fair (vetores
  sha256 conhecidos, determinismo, house edge, cap, verify, elo da cadeia); Round (transições/barreira da
  seed); Bet (place/limites/auto-cashout/confirm/reject/cashout floor/dupla liquidação/markLost); Money.

### Sessão 07 — Desenvolvedor — Etapa 4: Game Engine (curva + cadeia de seeds + Round + Scheduler + leitura)
- **Data:** 2026-06-19
- **Etapa(s):** Etapa 4 — Game Engine (o jogo roda sozinho e é verificável)
- **O que foi feito:** Pacote **`@crash-game/curve`** (`multiplierAt`/`elapsedForMultiplier`, ×100, puro).
  **Cold storage** da cadeia de seeds (`seed_chain` + `seed_chain_seed`, PK composta) + serviço de
  geração/rotação (CSPRNG + `generateChain`) + **buffer Valkey** (`LPOP` + refill + fallback síncrono à
  cold storage). **Persistência do `Round`** (state-stored) com **fencing por `version`** (UPDATE
  condicional). **`RoundScheduler`** autoritativo: **leader lease** (Valkey/Lua) + step-down + recovery no
  boot, loop `BETTING→RUNNING→CRASHED→SETTLED` com crash agendado **analiticamente** e guardrail de drift
  (`crash()` usa o crashPoint imutável, nunca `Date.now()`). **REST de leitura** (`/rounds/current` oculta
  crashPoint/serverSeed; `/history`; `/:id/verify`). Envs novas + dep `ioredis`. ADRs 0015/0016.
- **Por quê / decisões:**
  - **Escopo enxuto:** sem outbox/SQS (nada cross-service ainda), sem bets (dependem da saga), sem
    leaderboard (Etapa 7).
  - **Buffer = otimização; cold storage = fonte da verdade** (ADR 0013): `LPOP` null → fallback atômico ao
    Postgres; nunca derruba o loop.
  - **Lease elege, `Round.version` garante** (ADR 0015): redlock não resolve split-brain (Kleppmann); o
    fencing por version é a correção. Step-down + recovery no boot (rodada presa por líder morto).
  - **Curva não-autoritativa** (ADR 0016): `Math.exp/log` não são bit-determinísticos (ECMA-262); a
    autoridade é só o `crashPointX100` da semente.
- **Testes:** unit (curve; `SeedBuffer` hit/miss/stale/Valkey-down/refill; `LeaderLease` token/perda de
  liderança). Integração: repo do Round (ciclo + fencing) e da cadeia (consumo atômico/ordem/gap-free).

### Sessão 08 — Revisor + Desenvolvedor — Chaos/segurança das Etapas 3–4 e correções
- **Data:** 2026-06-19
- **Etapa(s):** Revisão (Etapas 3–4) + correções
- **O que foi feito:** Chaos engineering + revisão das Etapas 3–4 (núcleo provably-fair/`Money`/fencing
  confirmados corretos). Correções:
  - **B1 (liveness):** geração da cadeia (O(N) SHA-256) movida para **worker thread** — não trava mais o
    event loop. Single-pass (deriva `serverSeedHash` sem re-hashear).
  - **M1 (atomicidade):** consumo da seed + insert da rodada na **mesma transação** (`RoundOpener`) →
    elimina seed órfã que quebrava o elo da cadeia no `verify`.
  - **M2:** `reconcile` ganhou ramo **CRASHED** (rodada crashada-não-liquidada por líder morto é retomada).
  - **M3:** `stepDown` solta o lease (sem stall de até TTL sem líder).
  - **M4:** `publicSeed` deixou de ser constante → **beacon externo (drand)** commitado antes/revelado
    depois (anti-pré-computação) + fallback CSPRNG offline (ADR 0017).
  - **Minors:** `round_number` via sequence Postgres; buffer `clear()` na rotação; token do lease
    por-epoch; recovery trata `RUNNING` sem `startedAt`; `verify` expõe `crossChainBoundary`.
  - **Migração ESM repo-wide:** `import.meta.url` do worker quebrava sob `module: nodenext`; migrado o
    monorepo para ESM real (`module: "preserve"` + `moduleResolution: "bundler"` + `"type": "module"`).
  - **Bug TDZ sob ESM (`empty where`):** arrays `NON_TERMINAL`/`TERMINAL` computados no topo do módulo
    viravam `[undefined]` → `where` vazio → loop no scheduler; corrigido computando inline na chamada.
  - **Bug `id` ausente** nos DTOs de `history`/`current`/`verify`; paginação `limit`/`offset`; isolamento
    dos e2e em bancos `games_test`/`wallets_test`.
- **Por quê / decisões:** worker threads p/ CPU-bound; beacon externo com fallback; cold storage é
  exigência matemática (consumo reverso O(1)). Detalhes em `docs/reviews/review-etapas-03-04.md` e nos
  ADRs 0015–0017.
- **Testes:** unit (curve, `SeedBuffer`, `LeaderLease`, `DrandBeacon` fallback); integração reescrita p/ o
  `RoundOpener` (abertura atômica gap-free, fencing) em `games_test`. **Failover de líder observado** no
  `docker:up` (lease perdido → step-down → outra instância assume com Recovery).

### Sessão 09 — Desenvolvedor — Etapa 5a: Saga Game↔Wallet (fundação de messaging + débito)
- **Data:** 2026-06-20
- **Etapa(s):** Etapa 5a — Saga (perna de débito)
- **O que foi feito:** Pacotes `@crash-game/contracts` (5 schemas zod dos integration events + envelope
  `IntegrationMessage`) e `@crash-game/messaging` (port `SqsClient` + `AwsSqsClient`; `OutboxRelay` poller
  com `FOR UPDATE SKIP LOCKED`; `SqsConsumer` long-poll com ack/DLQ; port `InboxStore`). **Game:** `Bet`
  persistido (`UNIQUE(round_id,player_id)`, `version`) + `outbox`/`inbox` + migration;
  `MikroOrmBetRepository` (`place` = bet + outbox `DebitFunds` na mesma tx; `applyFromMessage` = inbox
  dedup + transição + fencing); `PlaceBetHandler`, `BetSagaService`, relay + `GameInboxConsumer`, `POST
  /bet` + `GET /bets/me`. **Wallet:** `outbox`/`inbox` + migration; `appendSagaResult` (inbox + append +
  projeção + outbox na mesma tx); `WalletSagaService.onDebitFunds` (idempotência em camadas + retry de
  version), relay + `WalletInboxConsumer`.
- **Por quê / decisões:** auto-cashout **deferido p/ Etapa 7**; late-debit → **refund automático** (5b);
  entrega **dividida 5a/5b** com revisão de dinheiro única ao fim; settlement = **líder-inline bulk
  UPDATE** (ADR 0018, na 5b). Sem dual-write (event store + outbox = mesmo Postgres, uma tx; SQS só no
  relay pós-commit). `player_id` sempre do `sub` do JWT. O fluxo pesado (REST, consumers SQS, relay) já é
  distribuído entre instâncias; só transições de rodada + settlement são do líder.
- **Testes:** unit (contracts 6, messaging 6, wallet-saga 4, + 134 antigos = 138); integração bet repo
  (place atômico, dup→409, applyFromMessage confirm/dedup/no_op/reject); e2e games 14 + wallet 21. Smoke
  via Kong: aposta 2500 → saldo 100000→97500 → CONFIRMED; aposta>saldo → REJECTED; aposta dupla → 409.

### Sessão 10 — Desenvolvedor — Etapa 5b: cashout + settlement do crash + refund
- **Data:** 2026-06-20
- **Etapa(s):** Etapa 5b — Saga (crédito/liquidação/compensação)
- **O que foi feito:** Fechou o loop de dinheiro sobre a 5a. **Domínio:** estado `Bet.REFUNDED` +
  `refund()` + evento `BetRefunded`. **Cashout:** `CashoutHandler` server-authoritative (multiplicador do
  relógio do servidor; `saveWithOutbox` = UPDATE fenced por `version` + outbox `CreditFunds{cashout}` na
  mesma tx); `POST /bet/cashout`. **Settlement (líder-inline, ADR 0018):** `BetRepository.markRoundLost` =
  bulk UPDATE `CONFIRMED→LOST` em `RoundScheduler.settleRound` (sem hidratar agregado, sem mover dinheiro,
  idempotente, sem bumpar `version`). **Refund reativo:** `onFundsDebited` → rodada terminal ⇒ `refund` +
  `CreditFunds{refund}`; senão `confirm`. **Wallet:** `onCreditFunds` (credita cashout|refund + outbox
  `FundsCredited` na mesma tx). ADR 0018.
- **Por quê / decisões:** bulk UPDATE evita o "OCC bloodbath" de um loop de agregados; **não bumpar
  `version`** no bulk deixa um cashout legítimo na borda do crash vencer a corrida (senão levaria 409 e
  perderia ganho devido). A blindagem do cashout é `mult ≤ crashPoint` no domínio (crashPoint vem do
  `Round`). Correlação `(reason, betId)` distinta por reason → idempotência da Wallet nunca colide.
- **Testes:** unit 141 (3 de refund); integração bet-saga 9/9 (cashout, version conflict, markRoundLost
  bulk/idempotente, refund); e2e games 18 + wallets 21. Docker (loop completo via Kong): cashout lucrativo
  (2000 @1.13x → payout 2260), crash sem saque → LOST, cashout @1.00x → crédito de volta; DLQs vazias.

### Sessão 11 — Revisor + Desenvolvedor — Revisão de dinheiro das Etapas 2+5, endurecimento e refactors
- **Data:** 2026-06-20
- **Etapa(s):** Etapa 5 — revisão obrigatória de dinheiro + correções
- **O que foi feito:** Revisão de dinheiro (Etapas 2+5) em duas frentes convergentes (chaos/security review
  + `ts-backend-reviewer` + revisão humana de legibilidade/SOLID). **Núcleo de dinheiro confirmado
  correto** (sem float, saldo ≥ 0, idempotência em camadas, atomicidade sem dual-write, anti
  dupla-liquidação, corrida cashout-vs-crash blindada, refund, authz por `sub`). Correções:
  - **Bug público:** `GET /rounds/:id/verify` com id não-UUID ia a **500** → validado com zod na borda →
    **400**.
  - **Endurecimento:** timeouts no cliente SQS; `statement_timeout`/`idle_in_transaction_session_timeout`
    + pool no preset MikroORM; **poison-pill escape** na outbox (`status='failed'` após 10 tentativas); PII
    só em `debug`; invariante do payout no cashout vira `throw`.
  - **Refactors (DRY/SRP):** `createMikroOrmOutboxStore` compartilhado; `createInboxConsumer`/
    `createOutboxRelay`/`errorMessage` em `@crash-game/messaging`; `parsePagination`; `withVersionRetry`;
    **split CQRS** do repo de aposta (`BetQueryRepository`); `roundId` propagado em `DebitFunds`/
    `FundsDebited` (corta leitura dupla no hot path do confirm-vs-refund).
  - **2 bugs pré-existentes:** `test:e2e` do root rodava os 2 serviços no mesmo processo (colisão de
    `DATABASE_URL`) → corrigido p/ `--filter`; healthcheck do compose usava `curl` (ausente na imagem Bun)
    → trocado por `bun -e fetch`.
- **Por quê / decisões:** detalhes nos 3 docs de review. O "bloqueante" reportado pelo agente revisor
  (games não compila) era **stale** — ele leu os arquivos no meio do split CQRS; refutado com `typecheck`
  verde.
- **Testes:** unit **147** (6 novos de `BetSagaService`); e2e **39** (games 18 + wallets 21). Validado no
  `docker:rebuild`: stack healthy; smoke do fluxo de dinheiro via Kong (débito→CONFIRMED; cashout @1.01x→
  +20 líquido; sem-saque→LOST; DLQs vazias).

### Sessão 12 — Desenvolvedor — CI (GitHub Actions) — bônus B7
- **Data:** 2026-06-20
- **Etapa(s):** Etapa intermediária — CI pipeline (bônus B7)
- **O que foi feito:** `.github/workflows/ci.yml` com 2 jobs em push/PR: **`quality`** (lint + typecheck +
  unit, sem infra) e **`e2e`** (sobe a infra via `docker compose up -d postgres localstack valkey
  keycloak`, espera healthy, roda `bun run test:e2e`). Bun fixado em 1.3.14, cache do `~/.bun/install/cache`,
  `--frozen-lockfile`, `concurrency` cancela execuções antigas do mesmo ref, dump de logs no `failure()`.
- **Por quê / decisões:** os e2e sobem o `AppModule` no processo do runner (não precisam dos containers
  games/wallets — só da infra). Postgres cria `games_test`/`wallets_test` no init; LocalStack cria as filas;
  Keycloak importa realm + usuário — tudo zero-manual, como o `docker:up`.
- **Testes:** YAML validado; `--frozen-lockfile` em sync; o passo `e2e` reproduzido localmente **39/39 verde**.

### Sessão 13 — Desenvolvedor — Etapa 6: WebSocket + sincronização real-time
- **Data:** 2026-06-20
- **Etapa(s):** Etapa 6 — WebSocket (R4 + R10)
- **O que foi feito:** Push server→cliente via `socket.io` + adapter Valkey (fanout entre instâncias). Dois
  pacotes novos: **`@crash-game/realtime-contracts`** (nomes/payloads dos eventos, reusável pelo front) e
  **`@crash-game/realtime`** (infra WS compartilhada: `ValkeyIoAdapter`, opções WebSocket-only, helpers de
  handshake). **Game**: `GameGateway` (handshake **híbrido**) emitindo `round:*` + `round:tick` (250ms)
  pós-commit no scheduler, e `bet:placed`/`bet:updated` nos handlers/saga; **username** persistido na `Bet`
  (migration). **Wallet**: `WalletGateway` (handshake **estrito**) empurrando `balance:updated` à sala
  privada `user:{sub}` pós-commit. Kong ganhou rotas WS. **Adições:** Swagger/OpenAPI (`/docs` nos 2
  serviços) + e2e HTTP das apostas (`bet-api.e2e`, +11).
- **Por quê / decisões:** auth **híbrido** no Game (anônimo assiste; token inválido rebaixa, não derruba) e
  **estrito** na Wallet (saldo é privado); saldo empurrado pela **dona** (Wallet); ticks como **clock-sync**
  (autoridade = `elapsedMs`, não o multiplicador — Dead Reckoning/ADR 0016); **WebSocket-only** dispensa
  sticky session; **emitir só PÓS-commit** (Transaction Visibility Race — WS é efêmero, dispensa outbox mas
  exige a ordem).
- **Testes:** unit **154** (7 novos de `realtime-events`: não-vazamento de segredo + payloads); e2e WS games
  4/4 (**2 conexões = mesmo estado** — R4) + wallet 3/3 (estrito rejeita; saldo privado). Suíte e2e: games
  33 + wallets 24. Smoke via Kong: lifecycle completo, `bet:placed`/`bet:updated`, `balance:updated` privado.

### Sessão 14 — Desenvolvedor — Etapa 7a: Seed determinística (B5) + E2E cross-service
- **Data:** 2026-06-21
- **Etapa(s):** Etapa 7 — bônus B5 + system-test cross-service
- **O que foi feito:** **Crash determinístico** via env `GAME_FIXED_CRASH_X100` (test-only): seam opcional
  `fixedCrashPointX100?` em `Round.open()` (domínio puro; default = provably-fair), repassado pelo
  `MikroOrmRoundOpener` com warning alto no boot. **Script `bun run seed:e2e`** (top-up idempotente do
  jogador via Kong). **`docker-compose.e2e.yml`** (crash fixo 2,00x + timings folgados). **System-test
  cross-service** (`tests/system/`, `bun run test:system`): HTTP via Kong, 2 cenários (débito→cashout→crédito
  e crash→LOST), asserções por **delta de saldo**. **CI:** job `system` (sobe a stack completa via
  `docker:e2e`, seed, system-test).
- **Por quê / decisões:** override de env (simples, 100% determinístico) em vez de pré-computar seeds; seam
  explícito no domínio (honesto/testável) em vez de hack no infra; seed via REST (sem race com o engine,
  idempotente). Determinismo do **jogo** no env, do **dinheiro** no script; system-test usa deltas (robusto
  ao saldo inicial).
- **Testes:** unit **155**; e2e per-service games 33 + wallets 24 (sem regressão); **system-test 2/2** contra
  `docker:e2e`; `seed:e2e` idempotente; warning do boot confirmado.

### Sessão 15 — Desenvolvedor — Etapa 7b: Auto-cashout (B2)
- **Data:** 2026-06-21
- **Etapa(s):** Etapa 7 — bônus B2
- **O que foi feito:** Saque automático server-authoritative. `AutoCashoutService.sweep(...)` roda no **tick
  loop do líder** (`RoundScheduler`): saca apostas `CONFIRMED` cujo `autoCashoutTargetX100` foi atingido, **no
  alvo** (payout `amount × target`, determinístico). Novo `BetRepository.findAutoCashoutCandidates`. Reusa
  `Bet.cashout` + `saveWithOutbox` (fencing + outbox `CreditFunds`) — sem migration, sem rota nova de
  dinheiro. Ticks religados no recovery de RUNNING.
- **Por quê / decisões:** saque no ALVO (imune ao jitter do tick; `target < crashPoint` garantido no
  RUNNING); fencing por `version` → só 1 crédito (corrida auto/manual/settlement segura — `markRoundLost`
  não bumpa version, então auto-cashout legítimo sobrepõe LOST→CASHED_OUT corretamente); guard de
  re-entrância; leader-only (sem contenção).
- **Testes:** unit `auto-cashout.service` 4 (alvo/payout/outbox/emit; corrida→pula; no-op; re-entrância) →
  total **159**; **system-test** novo cenário (alvo 1,50x < crash fixo 2,00x → servidor saca sozinho) **3/3**;
  e2e games 33 + wallets 24.

### Sessão 16 — Desenvolvedor — Etapa 7c: Auto-bet (B3) — AutoBetSession
- **Data:** 2026-06-21
- **Etapa(s):** Etapa 7 — bônus B3 (peça central)
- **O que foi feito:** Aposta automática server-side via novo agregado **`AutoBetSession`** (Process Manager,
  state-stored, fencing por `version`). Estratégia FIXED/MARTINGALE + freios obrigatórios (stop-loss, budget)
  e opcionais (stop-win, max-rounds). Execução leader-only (`AutoBetRunner`): `openRound`→placeBets (decide +
  coloca, saca no alvo via B2), `settleRound`→reconcile (mapeia status terminal da bet→outcome). Migration
  `auto_bet_session` (índice único parcial 1-ativa/jogador). REST `/games/autobet` (start/me/stop).
- **Por quê / decisões:** **SKIPPED_ROUND** (aposta não-CONFIRMED nunca pune o Martingale — latência SQS) +
  **idempotência** (`lastProcessedRoundId` → settlement reexecutado não dobra). Correlação via `currentBetId`
  na sessão (sem coluna na bet; não colide com aposta manual). Reconcile lê status terminal (cobre
  REJECTED→encerra) sem acoplar à saga. Um save por passo (fencing limpo). `/me` retorna a sessão mais recente
  (qualquer status) — frontend mostra o resultado.
- **Testes:** unit agregado 17 + runner 5 (total **181**); e2e REST 6 (games **39**); system-test novo cenário
  (servidor aposta 2 rodadas, vence via auto-cashout, encerra MAX_ROUNDS, lucro 100) **4/4**.

### Sessão 17 — Desenvolvedor — Etapa 7d: Leaderboard (B6)
- **Data:** 2026-06-21
- **Etapa(s):** Etapa 7 — bônus B6
- **O que foi feito:** `GET /games/leaderboard?period=24h|week` (público) — top por lucro líquido.
  `LeaderboardQueryRepository` agrega na `bet` (`SUM(COALESCE(payout,0) − amount)`, status resolvidos, janela
  por `resolved_at`). **Covering index** `(status, resolved_at) INCLUDE (player_id, username, payout_cents,
  amount_cents)` → Index-Only Scan. Cache **Valkey** TTL curto (degrada com elegância). `ValkeyPort` ganhou
  `get`/`setPx`.
- **Por quê / decisões:** query+cache vs materialized view (sempre coerente, sem job de refresh); `COALESCE`
  para LOST contar como −aposta; `INCLUDE` (payload na folha, não na chave).
- **Testes:** e2e REST 2 (ranking alice>bob por lucro; period inválido→400) → games e2e **41**; unit **181**;
  smoke via Kong OK.

### Sessão 18 — Desenvolvedor — Etapa 7e: Rate limiting (B8)
- **Data:** 2026-06-21
- **Etapa(s):** Etapa 7 — bônus B8
- **O que foi feito:** Plugin Kong `rate-limiting` (`policy: redis`/Valkey, `limit_by: ip`, `fault_tolerant`).
  Escrita (POST) 120/min, leitura 3000/min, WS sem limite. Diferenciação por **método** no mesmo path
  (`strip_path` segue mapeando `/games/bet→/bet`).
- **Por quê / decisões:** método (não path) p/ não quebrar o strip; tetos generosos de produção em vez de um
  `kong.yml` de e2e (evita drift; system-test segue verde; 429 ainda demonstrável). redis policy p/
  multi-instância.
- **Testes:** live via Kong — headers `X-RateLimit-*` (POST→120, GET→3000); **burst paralelo de 160 POST →
  119×401 + 41×429**; system-test **4/4** sob os limites. Sem mudança de código (só `kong.yml`).

### Sessão 19 — Desenvolvedor — Etapa 7f: Observabilidade (B4)
- **Data:** 2026-06-21
- **Etapa(s):** Etapa 7 — bônus B4
- **O que foi feito:** Métricas OTel/Prometheus + Grafana. Pacote `@crash-game/observability` (`startMetrics`
  → PrometheusExporter + MeterProvider global). `GameMetrics` (bets/wagers/payouts/rounds counters +
  crash-point/ws-latency histogramas) instrumentado em PlaceBet/Cashout/AutoCashout/Scheduler/Gateway.
  `WalletMetrics` (movements/cents por reason) no WalletMovementService. `docker-compose`: Prometheus (scrape
  9464/9465) + Grafana (3001, datasource+dashboard provisionados, zero-manual).
- **Por quê / decisões:** **counters puros + RTP via PromQL no Grafana** (gauge de razão na app destruiria a
  agregação entre instâncias — média de médias). Nomes sem `_total`/`unit` (o exporter já sufixa).
  `startMetrics` antes do NestFactory (MeterProvider global p/ o DI). Meter no-op sem provider (testes ok).
- **Testes:** live `docker:up` — `/metrics` ambos respondem; Prometheus **2 targets up**; deposit→
  `wallet_movements` scraped; Grafana healthy + dashboard "Crash Game — Overview" provisionado. unit **181**.

### Sessão 20 — Revisor + Desenvolvedor — Etapa 7: revisão de dinheiro focada (B2+B3) + correções
- **Data:** 2026-06-21
- **Etapa(s):** Etapa 7 — revisão obrigatória de dinheiro (movimentos automáticos)
- **O que foi feito:** Revisão de dinheiro focada em B2 (auto-cashout) e B3 (auto-bet) — duas frentes
  convergentes (chaos review + `ts-backend-reviewer`). **Zero bloqueante de correção monetária** (1 débito +
  ≤1 crédito por aposta; saldo nunca negativo; SKIPPED_ROUND; idempotência por `lastProcessedRoundId`; authz
  por `sub`). Correções: **retry no `AutoBetService.stop`** (corrida REST×reconcile-do-líder — antes virava
  500 e podia deixar a sessão ativa); **sweep resiliente** (payout ausente → log+continue, não aborta a
  varredura); documentação do **contrato cruzado do version-fence** `saveWithOutbox`↔`markRoundLost`; warning
  de anomalia CONFIRMED-no-reconcile.
- **Por quê / decisões:** o version-fence só-por-version é load-bearing e proposital (ADR 0018) — deixa o
  auto-cashout legítimo (`target ≤ crashPoint`) vencer a corrida settle-then-sweep; punir por timing interno
  seria injusto. Recusei a sugestão de `status:CONFIRMED` no fence pois inverteria o ADR 0018/justiça do
  cashout na borda.
- **Testes:** unit **185** (+ retry do stop, + anomalia CONFIRMED→SKIPPED); e2e games **41** + wallets **24**.

### Sessão 21 — Desenvolvedor — Etapa 8: hardening e entrega
- **Data:** 2026-06-21
- **Etapa(s):** Etapa 8 — hardening + entrega (R1/R12/R13, security review)
- **O que foi feito:**
  - **Verificação dos testes obrigatórios** contra o README — todos presentes. Única lacuna: e2e de "saldo
    insuficiente" ponta-a-ponta → adicionado ao `tests/system` (aposta sem saldo → REJECTED, saldo nunca
    negativo).
  - **Security review:** varredura de hardcoded/`process.env` solto → limpo (sem secrets). `.env.example`
    sincronizados com os schemas zod (faltavam ~15 vars no games, ~9 no wallets).
  - **Fechamento de portas:** `games`/`wallets` deixaram de publicar porta no host (`expose`) — acessíveis
    **só via Kong** (auth + rate-limiting não-contornáveis).
  - **Comando único de e2e:** `bun run e2e:system` (docker:e2e `--wait` → seed:e2e → test:system).
  - **Limpeza de comentários** em todo o código: removida narração inline; JSDoc objetivo só em
    classes/lógica densa; gotchas load-bearing preservados (`markRoundLost`/`saveWithOutbox` version-fence).
  - **Docs de entrega:** novo `README.md` (setup, fluxos, API, eventos WS, decisões/trade-offs, testes);
    enunciado original → `REQUISITOS.md`; `GUIDELINE.md` por serviço + um para `packages/`.
- **Por quê / decisões:**
  - **`.env.example` em `localhost`** (o `docker:up` injeta as suas próprias com hosts da rede). Consts de
    domínio (`MIN_MULTIPLIER_X100`) e tuning de resiliência (`MAX_ATTEMPTS`) **ficam no código** — env é para
    negócio/ambiente/secret.
- **Testes:** typecheck / lint / unit **185** limpos; e2e de API **20/20** ao vivo; system **5/5** (com o
  crash fixo via `docker:e2e`). Verificação tripla de que a limpeza de comentários não tocou código (64
  arquivos só-comentário byte-idênticos ao baseline; zero string cortada; build+lint+testes verdes).

### Sessão 22 — Desenvolvedor — Frontend F0: Fundação (Next.js no monorepo)
- **Data:** 2026-06-21
- **Etapa(s):** Frontend F0 — Fundação
- **O que foi feito:** Início da fase de frontend. Stack: **Next.js (App Router)** + Tailwind v4 + shadcn/ui +
  **TanStack Query** (server state) + **Zustand** (client state) + `oidc-client-ts`/`react-oidc-context`
  (auth OIDC PKCE) + `socket.io-client`. Scaffold do Next 16 no `frontend/` integrado como **workspace Bun**,
  `transpilePackages` p/ consumir `@crash-game/curve` + `@crash-game/realtime-contracts`. **Design tokens**
  (paleta dark + verde neon) como `@theme` do Tailwind v4 em `globals.css`. `lib/utils` (`cn`, `formatBRL`,
  `formatMultiplier`), `lib/env`, `Providers` (QueryClient + Toaster sonner). Criado `frontend/GUIDELINE.md`.
- **Por quê / decisões:** Next.js sobre TanStack Start (familiaridade/velocidade/shadcn first-class; SSR
  quase sem uso — SPA logada, trade-off aceito). `oidc-client-ts` no browser (realm é **public client +
  PKCE**; NextAuth não encaixa). Frontend no mesmo monorepo p/ reusar curve + realtime-contracts. Workflow
  por steps F0–F8.
- **Testes:** `tsc --noEmit` limpo; **`next build` (Turbopack) verde**; `eslint` limpo.

### Sessão 23 — Desenvolvedor — Frontend F1: Auth OIDC PKCE + app shell
- **Data:** 2026-06-21
- **Etapa(s):** Frontend F1 — autenticação (OIDC PKCE) + shell
- **O que foi feito:** Camada de auth/dados/shell. `lib/auth` (UserManager `oidc-client-ts`, code+PKCE,
  lazy/client-only), `lib/api` (`apiFetch` tipado anexando `Authorization: Bearer` + `ApiError`),
  `hooks/use-wallet` (`GET /wallets/me`), `hooks/use-current-user`. `Providers` com `AuthProvider`
  **client-only mount** (loader neutro até hidratar — evita crash de SSR/mismatch). Rotas: `/` Landing
  pública, `/auth/callback`, grupo `(app)` com `AuthGuard` + `AppHeader` cobrindo `/lobby` e `/game` (stub).
  Fontes do design (Space Grotesk/JetBrains Mono/Inter). **Correção de infra (CORS no Kong):** preflight
  OPTIONS → 404 deixava o saldo "—" na topbar; corrigido com **plugin CORS global** no `kong.yml` (origins
  espelham os redirectUris do realm; header `Idempotency-Key` incluído p/ F4).
- **Por quê / decisões:** SPA logado → conteúdo de auth **não prerenderiza** (client-only mount); grupo de
  rotas `(app)` isola o shell autenticado; `/` e `/auth/callback` ficam públicos. Login/registro serão
  **theme custom do Keycloak** (F8), não tela React. Design importado via `DesignSync` por projectId; HTML
  salvo em `frontend/_design/` como referência.
- **Testes:** `tsc --noEmit` limpo; `next build` **verde** (5 rotas); `eslint` limpo. OIDC discovery + client
  PKCE consistentes com o `env`. **Validado no browser:** login + saldo real (R$ 200,00) ponta a ponta após
  o fix de CORS.

### Sessão 24 — Desenvolvedor — Frontend F2: Design system / componentes base
- **Data:** 2026-06-21
- **Etapa(s):** Frontend F2 — biblioteca de componentes
- **O que foi feito:** Primitivos em `src/components/ui/` casando o design: `Button` (cva
  primary/secondary/ghost/danger + loading), `Card`, `Skeleton` (shimmer), `StatusBadge` (7 status),
  `MultiplierPill` (cor por faixa <2x/≥2x/≥10x), `Segmented` (pill tabs, role=tablist), `Chip`, `NumberInput`
  (stepper de moeda em centavos, edição livre + clamp no blur), `ConnectionStatus`, `Avatar`, `CountdownRing`.
  Keyframes do design (`shimmer`/`pulseDot`/`crashShake`/`cashPop`) no `globals.css`.
- **Por quê / decisões:** componentes presentacionais e reusáveis (F3/F4/F5 consomem); cva p/ variantes
  tipadas; `NumberInput` trabalha em **centavos** (sem float na UI), commit no blur. **Correção de lint:**
  `providers.tsx` usava `useEffect(()=>setMounted(true))` (regra `react-hooks/set-state-in-effect`) → trocado
  por `useIsClient` com `useSyncExternalStore` (SSR-safe). **Storybook deferido** (priorizado o gameplay; pode
  entrar no F8).
- **Testes:** `tsc --noEmit` / `eslint` / `next build` limpos.

### Sessão 25 — Desenvolvedor — Frontend F3: Tela do jogo + auth pública/registro/refresh
- **Data:** 2026-06-21
- **Etapa(s):** Frontend F3 — tela do jogo (core) + refinamentos de auth
- **O que foi feito:**
  - **Auth público + registro + sessão:** jogo agora é **público** (espectador anônimo) — removido o
    `AuthGuard`, auth é por-ação. Header adaptativo (anônimo: Entrar + Criar conta; logado: saldo/ações/avatar).
    **Registro**: `registrationAllowed:true` no realm + `register()` via `prompt=create`. **Refresh
    automático** + **degrade gracioso sem reload** (`AuthSessionManager` escuta `addAccessTokenExpired`→
    `removeUser()` → UI volta a anônimo reativo).
  - **Tela do jogo:** `lib/socket` (socket.io WebSocket-only, token em `auth.token`); `game-store` (Zustand:
    fase/round/tick/liveBets/history/conn); `useGameSocket` (liga WS ao store + patcha o saldo no cache via
    `balance:updated`); **`useCrashEngine`** (dead reckoning rAF: âncora no `elapsedMs` do tick + curva
    `@crash-game/curve`, fora do React state — ADR 0016); `useBetActions`. Componentes `CrashChart`,
    `HistoryStrip`, `LiveBets`, `BetPanel` (inline, tab Manual + Auto stub) e **`BetButton` XL multi-estado**.
  - **Iteração visual** (vários rounds): layout 2 colunas (curva ampla à esq.; direita empilha
    Aposta+Apostas-da-rodada); curva exponencial com eixos saturantes ("zoom infinito"); motor escreve o
    **float contínuo** a ~30fps (anima fluido em vez de saltar); countdown ring 120px inline.
- **Por quê / decisões:** jogo público espelha o gateway WS híbrido do backend; auth por-ação é o modelo
  correto. Multiplicador **fora do React state** (zustand throttled + curva) p/ não re-renderizar a 60fps.
  `myBet` derivado por `{roundId,betId}` (sem reset-em-effect). Lição Zustand v5: seletor não pode retornar
  array novo (`.filter`) — selecionar ref estável + `useMemo` (loop de `getSnapshot`).
- **Testes:** `tsc`/`eslint`/`next build` limpos. **WS validado headless via Kong**: round:opened/started/tick/
  crashed (serverSeed revelada)/settled.

### Sessão 26 — Desenvolvedor — Frontend F4: modais REST
- **Data:** 2026-06-21
- **Etapa(s):** Frontend F4 — fluxos REST secundários (modais)
- **O que foi feito:** `ui-store` (Zustand, modal ativo — um por vez) + `Modal` shell acessível (overlay,
  Escape, click-outside, scroll-lock, role=dialog/aria-modal) + `Toggle`. Hooks REST: `useWalletActions`
  (deposit/withdraw, **Idempotency-Key UUID por submit**, patch do saldo no cache), `useBetHistory`,
  `useLeaderboard`, `useVerify`. Modais: **Wallet** (deposit/withdraw), **History**, **Leaderboard** (toggle
  24h/semana, destaca o jogador), **Verify** (commitment/crash recalc/elo da chain + seeds copiáveis),
  **Settings** (prefs de som + exibir-fórmula em `prefs-store` persistido; logout). Gatilhos no header e
  "Verificar →" no estado CRASHED do chart.
- **Por quê / decisões:** um store de UI simples (modal só abre um) evita prop-drilling; Idempotency-Key por
  submit (retry da mesma op = no-op no backend). `prefs-store` já nasce p/ o F7 (som) ler.
- **Testes:** `tsc`/`eslint`/`next build` limpos. Endpoints validados via Kong (token+CORS): deposit 200,
  bets/me 200, leaderboard 200, verify `isValid:true`.

### Sessão 27 — Desenvolvedor — Fix de CI (frontend no monorepo) + auto-provisão de carteira
- **Data:** 2026-06-21
- **Etapa(s):** Correção de CI (consequência de plugar o frontend) + ajustes
- **O que foi feito:** Plugar o frontend no monorepo causou 3 regressões no CI, todas corrigidas:
  - **Lint:** `eslint .` da raiz varria `frontend/` com o typed-linting do backend → raiz passou a **ignorar
    `frontend/**`**; o frontend é lintado à parte no job `quality` (`cd frontend && lint/typecheck/build`).
  - **@types/node duplicado:** o create-next-app trouxe `@types/node@^20` hoisted, divergindo do `@25` do
    backend → tipos de `worker_threads` quebraram; alinhado o frontend p/ `^25`.
  - **Docker e2e "Workspace not found frontend":** o `.dockerignore` excluía a pasta `frontend` inteira mas
    os Dockerfiles copiam o `package.json` raiz (lista `frontend`) → `.dockerignore` passou a permitir só
    `frontend/package.json`.
  - **Ajustes:** **auto-provisão de carteira** — conta nova não tem carteira (GET /wallets/me → 404);
    `useEnsureWallet` dispara `POST /wallets` (idempotente, 409 ignorado). Feito no **frontend** (endpoint já
    existe, sem reabrir o backend de dinheiro). **Gate do painel de aposta p/ anônimo** (blur + overlay CTA).
- **Por quê / decisões:** frontend tem toolchain própria (Next/ESLint) → fora do typed-linting da raiz.
  Lição p/ o `frontend/GUIDELINE.md`: rodar `bun run lint` **na raiz** pega o efeito no backend.
- **Testes:** validado localmente o pipeline inteiro — lint raiz ✓, typecheck backend ✓, 185 unit ✓, frontend
  lint/typecheck/build ✓, **`docker build` do serviço games ✓**.

### Sessão 28 — Desenvolvedor — Frontend F5: Auto Bet (tab no painel inline)
- **Data:** 2026-06-21
- **Etapa(s):** Frontend F5 — Auto Bet (B3 no front)
- **O que foi feito:** `useAutoBet` (query `/games/autobet/me` com **refetchInterval 1,5s enquanto ACTIVE** +
  mutations start/stop, toasts). `AutoBetTab` (substitui o stub na aba Auto): config — Segmented
  FIXED/Martingale + Aposta base/Cashout alvo/Stop-loss/Orçamento (NumberInput) + resumo textual; estado
  **RODANDO** (status ACTIVE) — painel pulsante com Resultado/Rodadas/Próxima aposta/Apostado + "Parar Auto
  Bet"; resumo da última sessão terminal (P&L + motivo traduzido).
- **Por quê / decisões:** auto-bet roda no servidor (líder) → o front **polla** o `/me` (não há evento WS de
  autobet) só enquanto ativa. `budgetCents` é obrigatório no backend → incluído no form. Martingale on-loss é
  interno do backend → não exposto.
- **Testes:** `tsc`/`eslint`/`next build` limpos; ciclo validado via Kong: start 201 → /me ACTIVE → stop 200.

### Sessão 29 — Desenvolvedor — Frontend F6–F8: polish, som, Playwright, dockerização, Keycloak theme, entrega
- **Data:** 2026-06-21
- **Etapa(s):** Frontend F6 (polish) + F7 (som/Playwright) + F8 (entrega)
- **O que foi feito:**
  - **F6 polish:** count-up animado do saldo (`useCountUp`), flash de crash, pop de cashout,
    `prefers-reduced-motion`.
  - **F7 som + e2e:** sons sintetizados via Web Audio (sem assets) — **aposta** (blip 440Hz triangle),
    **cashout** (660→880Hz sine), **crash** (180→110Hz sawtooth), respeitando o `prefs-store`
    (`useGameSounds`). **Playwright** config + suíte de espectador (landing/lobby/multiplicador/gate);
    browsers do SO faltam no WSL → roda no CI.
  - **F8 entrega:** **Dockerização** (Next standalone + Dockerfile multi-stage; `frontend` no compose →
    `docker:up` sobe o front zero-manual). **Keycloak custom login theme** (`junglecrash`, dark+verde, nome
    **JUNGLEcrash** via displayNameHtml). README do frontend + link no raiz.
  - **Ajustes:** defaults de stop-loss/orçamento; input travado em R$1.000 e **2 casas decimais**; auto-bet
    com **card de ganho potencial** da rodada; **"Verificar última rodada"** nas configurações; landing sem os
    stat cards.
  - **Storybook: NÃO entregue** — `@storybook/nextjs@8` é **incompatível com Next 16** (erro de resolução no
    preset). Revertido — único bônus de frontend não-entregue (limitação de versão, não de esforço);
    Playwright cobre o e2e de browser.
  - **Limpeza de comentários** aplicada ao frontend (narração redundante removida; "porquês" load-bearing
    mantidos).
- **Por quê / decisões:** carteira provisionada no front (não middleware backend) p/ não reabrir o core de
  dinheiro. Pacing F6–F8 corridos direto, teste só no final.
- **Testes:** `tsc`/`eslint`/`next build` limpos em cada fase; **`docker build` do frontend ✓** (serve 200);
  Keycloak theme verificado; endpoints REST/WS via Kong validados.

<!-- Próximas entradas (dev agents / revisor) vão abaixo, em ordem. -->
