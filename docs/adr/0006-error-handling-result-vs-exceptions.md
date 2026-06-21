# ADR 0006 — Tratamento de erros: Result no domínio + exceptions técnicas nas bordas

**Status:** Aceito

## Contexto

Precisamos de erros de negócio explícitos e type-safe (dinheiro real) sem poluir o domínio com
`try/catch`, mas ainda lidar com falhas técnicas (DB/SQS/Valkey fora).

## Decisão

Estratégia **híbrida por camada**:
- **Domínio → `Result<T, DomainError>`** (error-as-value). Regras de negócio esperadas (saldo
  insuficiente, aposta fora da fase, aposta dupla, min/max) **nunca lançam**; retornam `Result.fail`.
- **Aplicação** propaga o `Result`; falhas técnicas são exceptions (deixa estourar).
- **Apresentação** → Exception Filter global mapeia `DomainError` → HTTP (400/401/403/404/409/422) e
  técnico → 500 sem vazar internals.
- **Consumers SQS** → retry + DLQ; idempotência evita duplicar dinheiro.
- **Promises**: `no-floating-promises`, timeouts em I/O externo.

## Consequências

- (+) Erros de negócio fazem parte da assinatura; o compilador obriga a tratar.
- (+) Domínio puro e fácil de testar.
- (−) Boilerplate do `Result` — mitigado por helpers em `@crash-game/domain-kit`.
