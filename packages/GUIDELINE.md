# Packages — GUIDELINE

> Contexto denso para quem for mexer nos pacotes compartilhados do monorepo. Leia junto com
> `docs/guidelines/DEVELOPMENT_GUIDELINE.md`. **Um** guideline para todos: os pacotes são shared
> kernels pequenos, com as mesmas convenções — separá-los em um arquivo cada seria só overhead.

## O que é um package aqui

Código **compartilhado** entre os serviços (e, em alguns casos, o frontend). Regra de ouro:
um package só existe quando o mesmo conceito é usado em **mais de um** lugar e a divergência entre
cópias seria um bug (ex.: a fórmula da curva, o formato de um evento, o VO de dinheiro). Nada de
regra de negócio de um bounded context específico — isso mora no serviço.

Convenções comuns:
- **Sem dependência de framework** quando possível (domain-kit, money, curve, contracts são TS puro).
  O acoplamento ao NestJS/MikroORM/socket.io fica isolado em `nestjs-kit`, `persistence`, `realtime`.
- **Sem estado global mutável**; funções puras e classes imutáveis onde fizer sentido.
- Mesmas regras do projeto: TS strict, sem `any`, sem `!` (definite-assignment), dinheiro nunca em float.
- Cada package publica sua superfície por `src/index.ts` (barrel); o que não está exportado é privado.

## Catálogo

### Shared kernel — domínio puro (sem framework)

- **`@crash-game/domain-kit`** — blocos de DDD: `Result<T,E>` (erros como valor, não exceção),
  `DomainError`, `DomainEvent`, `Entity`, `AggregateRoot` (buffer de eventos + `pullEvents`),
  `ValueObject`. Base de todos os agregados dos serviços.
- **`@crash-game/money`** — `Money`: valor monetário em **centavos `bigint`**, imutável e
  não-negativo (ADR 0005). `multipliedBy` faz `floor` a favor da casa (cálculo do payout).
  Fonte única da aritmética de dinheiro — proíbe float por construção.
- **`@crash-game/curve`** — math **pura** da curva do crash, compartilhada Game↔frontend
  (ADR 0007). **NÃO-autoritativa** (ADR 0016): `Math.exp/log` não são bit-determinísticos entre
  arquiteturas, então a curva só **anima**; a autoridade do crash é o `crashPointX100` da semente.

### Contratos (mantêm os dois lados acordados na mesma forma)

- **`@crash-game/contracts`** — **integration events** do broker (SQS, cross-service):
  `DebitFunds`/`CreditFunds` e os resultados `FundsDebited`/`FundsDebitRejected`/`FundsCredited`.
  Dinheiro no fio = `number` (centavos inteiros), nunca `bigint` (JSON).
- **`@crash-game/realtime-contracts`** — contratos dos **eventos WebSocket** (server→client),
  compartilhados com o frontend. Mesma regra de dinheiro `number`; multiplicador inteiro ×100;
  timestamps ISO-8601.

### Glue de infraestrutura (acoplam framework, isolando-o do domínio)

- **`@crash-game/nestjs-kit`** — cola NestJS: `AuthModule` (guard global secure-by-default +
  `JoseJwtVerifier` via JWKS, ADR 0009), `@Public()`, `@CurrentUser()`, e o `ENV` validado por
  `zod` entregue por DI (fail-fast no boot).
- **`@crash-game/messaging`** — transporte do broker: `SqsClient`, **relay da outbox**
  (poller com backoff/`attempts`, sem CDC), `inbox` (dedup), `SqsConsumer` e o `host` que liga os
  loops. Implementa o at-least-once / exactly-once descrito nas guidelines dos serviços.
- **`@crash-game/realtime`** — infra WS compartilhada: `ValkeyIoAdapter` (fan-out entre
  instâncias via pub/sub), opções de gateway (WS-only + path + CORS) e helpers de handshake/auth do
  socket. Os **gateways** (regras de sala/auth) ficam em cada serviço.
- **`@crash-game/observability`** — bootstrap mínimo de métricas OpenTelemetry (B4): sobe o
  `PrometheusExporter` (serve `/metrics`) e um `MeterProvider` global; cada serviço cria seus
  instrumentos. A app só exporta contadores monótonos + histogramas; taxas/janelas ficam no Prometheus.
- **`@crash-game/persistence`** — preset base do MikroORM (opções comuns). Não conecta nada nem
  declara entidades; cada serviço chama o factory com seus `overrides`.

### Tooling

- **`@crash-game/eslint-config`** · **`@crash-game/typescript-config`** — config compartilhada de
  lint e TS (strict). Consumidos por todos os serviços e packages.

## Ao adicionar/alterar um package

1. É realmente compartilhado? Se só um serviço usa, mora no serviço.
2. Mantém a camada: contrato/domínio puro **não** importa framework.
3. Exporta pelo `index.ts`; testes em `tests/` do próprio package (`bun test packages`).
4. Mudança em contrato (`contracts`/`realtime-contracts`) é **breaking** para os dois lados —
   atualize produtor e consumidor juntos.
</invoke>
