# Architecture Decision Records

Registro das decisões arquiteturais grandes — o **porquê** de cada escolha (para estudo e para
justificar em entrevista). Uma decisão por arquivo, em ordem.

| # | Decisão |
| --- | --- |
| [0001](0001-messaging-sqs-localstack.md) | Mensageria: AWS SQS via LocalStack |
| [0002](0002-api-gateway-kong.md) | API Gateway: Kong |
| [0003](0003-hybrid-es-cqrs.md) | Híbrido: Event Sourcing na Wallet, CQRS+Outbox no Game |
| [0004](0004-money-via-broker-saga.md) | Movimento de dinheiro via saga assíncrona (não REST) |
| [0005](0005-money-integer-cents.md) | Precisão monetária: inteiro em centavos |
| [0006](0006-error-handling-result-vs-exceptions.md) | Erros: Result no domínio + exceptions nas bordas |
| [0007](0007-curve-shared-kernel-guardrail.md) | `@crash-game/curve` como Shared Kernel com guardrail estrito |
| [0008](0008-nestjs-kit-shared-package.md) | `@crash-game/nestjs-kit` como pacote compartilhado (auth + env) |
| [0009](0009-jwt-validation-jwks-in-app.md) | Validação de JWT via JWKS na aplicação (Kong só roteia) |
| [0010](0010-rest-money-idempotency-and-seed.md) | Idempotência das escritas REST de dinheiro + seed determinístico |
| [0011](0011-provably-fair-hash-chain-public-seed.md) | Provably fair: hash chain reversa + public seed (derivação BigInt) |
| [0012](0012-round-bet-separate-aggregates.md) | Round e Bet como agregados separados (referência por ID) |
| [0013](0013-seed-cold-storage-and-buffer.md) | Consumo de seeds: cold storage + job de rotação + buffer Valkey |
| [0014](0014-cashout-server-authoritative.md) | Cashout server-authoritative + anti dupla-liquidação |
| [0015](0015-leader-lease-version-fencing.md) | Single runner do scheduler: leader lease + fencing por `Round.version` |
| [0016](0016-curve-non-authoritative-and-timer-drift.md) | Curva não-autoritativa (transcendentais) + guardrail do drift do `setTimeout` |
| [0017](0017-external-beacon-public-seed.md) | Public seed via beacon externo (drand) — anti-pré-computação real + fallback |
| [0018](0018-settlement-leader-inline-vs-distributed.md) | Liquidação do crash: líder-inline (bulk UPDATE) vs distribuída (SKIP LOCKED) |

> Novas decisões grandes durante a execução das etapas devem virar um novo ADR aqui.
