# Wallet Service — GUIDELINE

> Contexto denso para o agente que for codar este serviço. Leia junto com
> `docs/guidelines/DEVELOPMENT_GUIDELINE.md`.

## Bounded context

A **carteira do jogador**: dona única do saldo. Toda movimentação de dinheiro do sistema passa por
aqui. Padrão: **Event Sourcing** — os eventos são a fonte da verdade; o saldo é uma projeção.

Porta direta: `4002`. Via Kong: `http://localhost:8000/wallets/*`. DB: `wallets`.

## Agregado

**`Wallet`** (event-sourced). Identidade: `player_id` (= `sub` do JWT), 1 carteira por jogador.

- Eventos: `WalletCreated`, `FundsCredited`, `FundsDebited`.
- Invariante: **saldo nunca negativo** (validado no agregado ao aplicar débito + `CHECK` no banco).
- Reconstrução: `fold(events)` → estado atual. Projeção `wallet.balance_cents` mantida na mesma tx.
- Concorrência otimista por `version` (`UNIQUE(wallet_id, version)`).

`Money` (VO de `@crash-game/money`): centavos em `BIGINT`, operações seguras, sem float.

## Movimentos de dinheiro (campo `reason`)

`deposit` · `withdrawal` · `bet` · `cashout` · `refund` · `initial`. Idempotência:
`UNIQUE(reason, correlation_id)` impede aplicar o mesmo movimento duas vezes.

## API REST (gestão da própria carteira)

| Método | Rota | Descrição |
| --- | --- | --- |
| POST | `/wallets` | Cria carteira do jogador autenticado |
| GET | `/wallets/me` | Saldo do jogador autenticado |
| POST | `/wallets/deposit` | Depósito (dinheiro fictício) — crédito `reason=deposit` |
| POST | `/wallets/withdraw` | Saque — débito `reason=withdrawal`, respeita saldo ≥ 0 |

> Débito de aposta e crédito de cashout **NÃO** são REST — chegam **só** via SQS (liquidação do jogo,
> cross-service). É isso que a regra do README ("crédito/débito não via REST") cobre.
>
> `deposit`/`withdraw` são uma **feature adicional intencional**, distinta da liquidação: a carteira
> mexendo no **próprio** dinheiro (intra-contexto, sem cruzar serviço), exposta via REST para tornar a
> app mais dinâmica (recarregar/sacar fora do jogo). Continuam sendo eventos do ledger
> (`reason=deposit|withdrawal`), auditáveis. Não confundir com o crédito/débito do jogo.

## Mensageria (SQS, cross-service)

- **Inbox (consome)**: `DebitFunds{betId, playerId, amountCents}`, `CreditFunds{cashoutId, playerId, amountCents}`.
  Dedup por `messageId`/`correlation_id`. Aplica ao agregado.
- **Outbox (publica)**: `FundsDebited`, `FundsDebitRejected` (saldo insuficiente), `FundsCredited`.
  Gravado na **mesma transação** do append de evento (transactional outbox).
- Relay: worker poller (`@crash-game/messaging`) publica a outbox no SQS com backoff/`attempts`; sem CDC.
- Falha de processamento → sem ack → retry → DLQ.

## Tabelas (DB `wallets`)

- `wallet_event` — append-only, fonte da verdade.
- `wallet` — projeção de saldo (`balance_cents BIGINT CHECK (>= 0)`, `version`).
- `inbox` — dedup de mensagens recebidas.
- `outbox` — resultados a publicar.

## Seed

Usuário de teste `player` (sub do Keycloak) com carteira criada e saldo inicial via evento
`deposit`/`initial`. Roda automático no `docker:up`.
