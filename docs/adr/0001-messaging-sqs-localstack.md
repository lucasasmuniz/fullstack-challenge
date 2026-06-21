# ADR 0001 — Mensageria: AWS SQS via LocalStack

**Status:** Aceito

## Contexto

O scaffold vinha com RabbitMQ. A vaga e o produto-alvo (AWS) usam **AWS SQS** com padrão
**transactional outbox/inbox**. O README permite SQS via LocalStack.

## Decisão

Usar **AWS SQS emulado por LocalStack** no ambiente local, substituindo o RabbitMQ. As filas são
criadas automaticamente no bootstrap do LocalStack (sem passo manual). DLQ por fila para mensagens
que falham N vezes.

## Consequências

- (+) Alinha com a stack de produção (AWS) e com o padrão outbox/inbox da vaga.
- (+) O mesmo código de produção roda local (só muda o endpoint do SQS).
- (−) LocalStack adiciona um container e um pouco de latência no boot.
- Idempotência fica por conta da **inbox** (dedup por `messageId`/`correlation_id`), já que SQS
  standard é at-least-once.
