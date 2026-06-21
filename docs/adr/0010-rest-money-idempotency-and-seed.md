# ADR 0010 — Idempotência das escritas REST de dinheiro + seed determinístico

**Status:** Aceito

## Contexto

A Wallet expõe `POST /wallets/deposit` e `/withdraw` (movimento intra-contexto, via REST — ver ADR
0004). Dinheiro real: um retry de rede do cliente **não pode** creditar/debitar duas vezes. Além disso,
o desafio exige um **usuário de teste com saldo pré-configurado** (R12) que suba zero-manual no
`docker:up`. O `player_id` da carteira é o `sub` do JWT — um UUID que o Keycloak **gera no import** do
realm (não determinístico por padrão), o que impede semear a carteira de antemão.

## Decisão

**1. Idempotência via `Idempotency-Key`.** Deposit/withdraw exigem o header `Idempotency-Key` (UUID), que
vira o `correlation_id` do evento no ledger. A garantia é dupla:
- **Checagem prévia** (`hasProcessed(reason, correlationId)`) → retry conhecido devolve o estado atual
  sem novo evento;
- **`UNIQUE(reason, correlation_id)`** no banco → corrida concorrente falha fechado
  (`UniqueConstraintViolationException`), tratada como sucesso idempotente.

**2. Seed determinístico.** Fixamos o `"id"` do usuário `player` no `realm-export.json` (sub estável) e
uma **migration** semeia a carteira financiada (eventos `WalletCreated` + `FundsCredited` reason=`initial`
+ projeção) para o **mesmo** UUID. Roda uma vez no `docker:up`, sem passo manual.

**3. `amountCents` na API como `number`.** Internamente o dinheiro é `bigint` (`Money`, ADR 0005); na
borda REST o `amountCents` trafega como `number` inteiro — os valores do jogo cabem com folga no
safe-integer (±9e15), e isso evita o atrito de serializar `bigint` em JSON. Conversão `number ↔ bigint`
só na borda.

### Nome do header: `Idempotency-Key` (sem `X-`)

Usamos `Idempotency-Key`, **não** `X-Idempotency-Key`. O prefixo `X-` para headers custom foi
**deprecado pela [RFC 6648](https://datatracker.ietf.org/doc/html/rfc6648) (2012)** — quando um header
`X-` "experimental" vira padrão, ou se quebra compat migrando para o nome sem prefixo, ou fica preso ao
`X-` poluindo o namespace. `Idempotency-Key` é o **padrão de facto** da indústria de pagamentos (Stripe,
PayPal, Adyen) e tem **draft oficial da IETF**
([`draft-ietf-httpapi-idempotency-key-header`](https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/)).
Headers HTTP são case-insensitive (RFC 7230), por isso lemos `@Headers("idempotency-key")` em lowercase.

### Janela de dedup (TTL): permanente, via ledger

A key **não** é guardada numa store dedicada com expiração — ela é o `correlation_id` **dentro do evento**
no `wallet_event` (ledger append-only e imutável, fonte de auditoria). Logo a dedup é **permanente** e
"de graça" (não há TTL porque não há store de keys a expirar).

Considerou-se um TTL curto (estilo Stripe, 24h). Rejeitado para o nosso caso, por dois motivos:
- **A key é por-intenção, não por-valor.** Cada nova intenção de depósito gera uma key nova (UUID); a
  mesma key só reaparece num retry da MESMA intenção. Um TTL não "libera" o jogador a depositar de novo
  (ele já pode, com key nova) — só define por quanto tempo um retry tardio é protegido.
- **Para dinheiro, janela maior é mais segura.** Com TTL curto, um retry que chega após a expiração
  (job atrasado, fila) **duplicaria** o movimento. O TTL do Stripe existe por **custo de storage** (key
  numa store separada), não por segurança; no nosso design a key já vive no ledger, então permanente não
  custa nada extra.

Se um dia o volume de keys virar problema de storage (fora do escopo), a alternativa é uma store de
idempotência separada com TTL (≥24h; 30min seria arriscado para dinheiro).

## Consequências

- (+) Retry seguro de escrita de dinheiro (padrão de mercado, ex. Stripe `Idempotency-Key`).
- (+) `docker:up` entrega a carteira do `player` financiada (1.000,00), sem passo manual.
- (+) Rigor de precisão preservado (`bigint` no core), sem o atrito de `bigint` no JSON.
- (−) O UUID do `player` fica "mágico" (literal em 2 lugares: realm + migration) — documentado e
  centralizado por comentário. Aceitável para um fixture de teste.
- (−) Dedup permanente (via ledger): uma key nunca "esquece". Aceitável e mais seguro para dinheiro
  (ver acima); alternativa com TTL exigiria store separada.
- Nota: a unicidade é **escopada por carteira** — `UNIQUE(wallet_id, reason, correlation_id)` — para a key
  de um jogador nunca interferir na de outro (ver chaos review W7).
