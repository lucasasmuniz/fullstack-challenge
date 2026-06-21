# ADR 0003 — Arquitetura híbrida: Event Sourcing na Wallet, CQRS+Outbox no Game

**Status:** Aceito

## Contexto

A vaga pede DDD + CQRS + Event Sourcing. ES completo em tudo é caro (event store, versionamento,
snapshots, replay, evolução de schema, poison events) e arriscado no prazo. Precisamos de auditoria
forte onde há dinheiro e de leitura eficiente onde o estado é efêmero.

## Decisão

- **Wallet → Event Sourcing.** O ledger é append-only; o evento é a fonte da verdade; o saldo é
  projeção. Auditoria perfeita de cada centavo ("como cheguei nesse saldo?").
- **Game → CQRS + Outbox/Inbox.** Agregados com estado persistido + domain events + read models
  (materialized views para history/leaderboard). A rodada é efêmera e bem servida por read models.

## Consequências

- (+) ES onde paga (dinheiro real, auditoria) sem o custo de ES em todo o sistema.
- (+) Read models otimizam as queries do frontend (history, bets/me, leaderboard).
- (−) Dois modelos mentais diferentes entre serviços — documentado nos `GUIDELINE.md`.
