# Wallet Service — GUIDELINE

> Contexto denso do serviço **Wallet**, para humanos e agentes. Cobre padrões, agregado event-sourced,
> persistência, fluxos, eventos e testes. Leia junto com o [README](../../README.md) (visão geral) e o
> [GUIDELINE dos packages](../../packages/GUIDELINE.md).

## Bounded context

A **carteira do jogador**: dona única do saldo. **Toda** movimentação de dinheiro do sistema passa por
aqui. Acessível **só via Kong** (`http://localhost:8000/wallets/*`); não publica porta no host. Banco
próprio: `wallets` (não compartilha com o Game).

**Padrão de persistência: Event Sourcing.** Os eventos do ledger são a **fonte da verdade**; o saldo é
uma **projeção** derivada por `fold(events)`. Nada muda sem um evento correspondente. Isso dá um ledger
auditável e reconstruível — apropriado para dinheiro (o Game, ao contrário, é state-stored).

## Agregado `Wallet` (event-sourced)

Identidade técnica: `walletId` (uuid). Identidade de negócio: `playerId` (= `sub` do JWT), **1 carteira
por jogador** (`UNIQUE(player_id)`).

- **Eventos:** `WalletCreated`, `FundsCredited`, `FundsDebited`. Cada evento carrega `version` sequencial.
- **Invariante central — saldo nunca negativo:** validado no agregado ao aplicar débito (`debit` →
  `Result.fail(InsufficientFundsError)` se não há saldo) **e** `CHECK (balance_cents >= 0)` no banco
  (defesa em profundidade).
- **Reconstrução:** `Wallet.rebuild(events)` faz o fold validando a **continuidade das versões** (1, 2,
  3, …) — gap, duplicata ou reordenação **falham fechado** (em vez de produzir saldo silenciosamente
  errado).
- **Concorrência otimista:** `UNIQUE(wallet_id, version)` — duas escritas concorrentes na mesma carteira
  colidem; o serviço recarrega e reaplica (retry).
- `Money` (`@crash-game/money`): centavos em `bigint`, sem float; operações seguras.

## Movimentos do ledger (`reason`)

`deposit` · `withdrawal` · `bet` · `cashout` · `refund` · `initial`. **Idempotência:**
`UNIQUE(reason, correlation_id)` impede aplicar o mesmo movimento duas vezes. Para a saga, o
`correlation_id` é o **`betId`** — então `bet`/`cashout`/`refund` do mesmo `betId` são movimentos
distintos e não colidem entre si.

## Persistência (DB `wallets`)

- **`wallet_event`** — append-only, fonte da verdade (ordenado por `version`).
- **`wallet`** — projeção de saldo (`balance_cents BIGINT CHECK (>= 0)`, `version`), atualizada **na mesma
  transação** do append (read model nunca diverge do ledger).
- **`inbox`** — dedup de mensagens recebidas (exactly-once).
- **`outbox`** — resultados a publicar (relay para o `game-inbox`).
- **Escrita da saga (`appendSagaResult`)** — numa **única transação**: registra a inbox (dedup), faz
  append dos eventos + atualiza a projeção (se houver eventos) e grava a outbox da resposta. Carteira
  inexistente ou débito recusado escrevem só inbox + outbox (ledger intacto). Conflito de `version`/inbox
  estoura `UniqueConstraintViolation` → o serviço desambígua e decide retry/dedup.

## Fluxos

**Crédito/débito do jogo (cross-service, consumido do `wallet-inbox`):**
- **`DebitFunds{betId, playerId, amountCents}`** → debita; resultado: `FundsDebited` (saldo caiu) ou
  `FundsDebitRejected` (saldo insuficiente — **regra de negócio**, vira `Result.fail`, **não** throw nem
  DLQ; a aposta no Game vira `REJECTED`). Carteira inexistente → `FundsDebitRejected` (mantém a saga viva).
- **`CreditFunds{betId, playerId, amountCents, reason: cashout|refund}`** → credita; resultado:
  `FundsCredited`. Crédito não tem recusa de negócio; carteira inexistente aqui é inconsistência real →
  **throw** (vai para DLQ; dinheiro devido nunca some em silêncio).
- **Idempotência em camadas:** inbox por `messageId` (reentrega → ack seco) + ledger
  `UNIQUE(reason, correlation_id)` (movimento já aplicado) + **retry sob conflito de `version`**
  (contenção na mesma carteira; esgotou → throw → SQS retenta → DLQ).
- Após o commit, emite `balance:updated` (WS, sala privada) — só quando o saldo realmente mudou.

**Movimentos intra-contexto (REST):** `deposit`/`withdraw` mexem no **próprio** dinheiro do jogador, sem
cruzar serviço. Compartilham o núcleo `WalletMovementService` (idempotência por carteira + retry de
version). `withdraw` respeita o saldo (≥ 0).

## API REST

`player_id` vem **sempre** do `sub` do JWT, nunca do body.

| Método | Rota | Auth | Descrição | Erros |
| --- | --- | --- | --- | --- |
| POST | `/wallets` | ✅ | Cria a carteira do jogador | `409` já existe |
| GET | `/wallets/me` | ✅ | Saldo do jogador | `404` sem carteira |
| POST | `/wallets/deposit` | ✅ | Depósito (idempotente por `Idempotency-Key`) | `400` key/valor · `409` reuso de key c/ valor diferente |
| POST | `/wallets/withdraw` | ✅ | Saque (respeita saldo ≥ 0) | `409` insuficiente / reuso de key |

> **Crédito/débito do jogo NÃO são REST** — chegam só via SQS (liquidação cross-service). É o que a regra
> do README ("crédito/débito não via REST") cobre. `deposit`/`withdraw` são uma **feature adicional
> intencional**: a carteira no próprio dinheiro (intra-contexto), exposta via REST para o jogador
> recarregar/sacar fora do jogo e manter o gameplay dinâmico (sem reiniciar containers/seed quando o saldo
> zera). Continuam sendo eventos auditáveis do ledger.

## Comunicação entre serviços (Wallet ↔ Game)

Os dois serviços **não compartilham banco nem se chamam por REST**. A Wallet só conversa com o Game de
forma **assíncrona via SQS**, com contratos versionados em `@crash-game/contracts` (validados por zod na
borda — payload incompatível falha no parse e vai para a DLQ, nunca aplica dinheiro errado).

```
Game ──  DebitFunds / CreditFunds  ──▶ [wallet-inbox] ──▶ Wallet  (consome → aplica ao ledger)
Game ◀── FundsDebited / FundsDebitRejected / FundsCredited ◀── [game-inbox] ◀── Wallet  (resultado)
```

- **Inbox (consome do `wallet-inbox`):** `DebitFunds`, `CreditFunds`. Dedup por `messageId`. Aplica ao
  agregado **na mesma tx** do registro da inbox.
- **Outbox (publica no `game-inbox`):** `FundsDebited`, `FundsDebitRejected`, `FundsCredited`. Gravado na
  **mesma transação** do append do evento (transactional outbox).
- **Envelope** (`@crash-game/contracts`): `{ messageId, type, occurredAt, payload }`; `messageId` (= id da
  linha de outbox) é a chave de idempotência, estável entre retries.
- **Relay:** worker poller (`@crash-game/messaging`) publica a outbox com backoff/`attempts`
  (`FOR UPDATE SKIP LOCKED`); sem CDC. Falha de processamento → sem ack → retry → DLQ.
- **Exactly-once** efetivo: inbox (dedup) + `UNIQUE(reason, correlation_id=betId)` no ledger + retry de
  `version`, todos transacionais. O lado do Game e o fluxo completo estão na
  [GUIDELINE do Game](../games/GUIDELINE.md).

## WebSocket (server → client)

- `balance:updated` (`balanceCents`, `currency`) — empurrado para a **sala privada** do jogador
  (`user:{sub}`, autenticado no handshake) após cada mudança de saldo. Fan-out multi-instância via adapter
  Valkey. Sem eventos públicos (o saldo é privado; eventos de jogo são do Game).

## Seed (zero-manual)

Usuário de teste `player` (sub do Keycloak) com carteira criada e **financiada com R$ 1.000,00** via
migration (`WalletCreated` v1 + `FundsCredited reason=initial` v2 + projeção). Roda no `docker:up`.

## Testes

- **Unit (`tests/unit`)** — `wallet` (create/credit/debit/insuficiente/precisão/rebuild com validação de
  version), `wallet-movement` (deposit/withdraw via handlers + idempotência + retry de version, com fake
  repo), `wallet-saga` (debit/credit/reject/refund + idempotência).
- **E2E (`tests/e2e`, `RUN_E2E=1`, precisa da infra)** — `wallet` (REST), `wallet-repository`
  (event store + projeção na mesma tx), `wallet-concurrency` (corrida na mesma carteira), `realtime`, `auth`.
- **System** — o fluxo cross-service (débito/crédito/refund) é exercitado pela suíte `tests/system` do
  Game (via Kong + SQS).

## Padrões e regras

- **Erros como valor** (`Result<T,E>`): saldo insuficiente é `Result.fail`, não exceção (vira
  `FundsDebitRejected`, nunca DLQ). Exceptions só para inconsistência real (ex.: crédito a carteira
  inexistente).
- **Dinheiro** sempre via `Money` (`bigint` centavos, sem float).
- **Saldo nunca negativo** — invariante no agregado + `CHECK` no banco.
- **Sem `any`, sem `!`**; agregado event-sourced reconstruído por `rebuild` (fold) com validação de versão.
- **Config por env** (zod, fail-fast no boot).
