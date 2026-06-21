# ADR 0018 — Liquidação do crash: líder-inline (bulk UPDATE) vs distribuída (SKIP LOCKED)

**Status:** Aceito (Etapa 5b)

## Contexto

No crash, toda aposta `CONFIRMED` que não sacou vira `LOST`. É a única operação O(N apostas) do ciclo
da rodada. Liquidar uma aposta perdida **não move dinheiro** (o débito já aconteceu na aposta; perder =
a casa fica com o valor) — é só um UPDATE de estado local.

Premissa-chave do desenho (corrigida no planejamento): o "fluxo pesado" **não concentra no líder**. REST
(`/bet`, `/bet/cashout`), consumers SQS (`confirm`/`reject`/`refund`/ack) e o relay da outbox já rodam em
**todas as instâncias**. Só as **transições da rodada** (open/start/crash/settle) e o **settlement** são
do líder (timeline-driven, single-writer irredutível). As demais instâncias **não ficam ociosas**.

## Decisão

**Opção A — líder liquida inline, com BULK UPDATE direto (não loop de agregados).** No `settleRound`, o
líder executa:

```sql
UPDATE bet SET status='LOST', resolved_at=now()
WHERE round_id = ? AND status = 'CONFIRMED';
```

via `em.nativeUpdate(BetEntity, { roundId, status: 'CONFIRMED' }, { status: 'LOST', resolvedAt })`.

### Por que bulk UPDATE e não um loop de agregados (evitar o "OCC bloodbath")

Hidratar N `Bet` em memória, chamar `markLost()` em cada uma e salvar com fencing por `version` é frágil:
um **cashout concorrente** bumpa a `version` de uma aposta no meio do loop, o `save` do líder falha com
conflito de version e **derruba o settlement de todos**. O bulk UPDATE com `WHERE status='CONFIRMED'`
**ignora naturalmente** quem virou `CASHED_OUT` na corrida (não casa o predicado → não é tocado, sem
exceção), liquida em **O(1) de rede** e é **idempotente** (re-settle = 0 linhas). CQRS correto: mutação
em massa não paga o pedágio de hidratar agregado.

### Por que NÃO bumpar `version` no bulk UPDATE (sutileza de corrida cashout-vs-crash)

O UPDATE seta `status='LOST'` mas **mantém `version`**. Isso é deliberado: um cashout **legítimo** que
leu a rodada `RUNNING` um instante antes do crash (multiplicador ≤ crashPoint, validado no domínio) pode
commitar **depois** do settlement. Seu `saveWithOutbox` faz fencing `WHERE version = N`; como o bulk não
mexeu na `version`, o UPDATE casa e sobrescreve `LOST → CASHED_OUT` — **o saque válido vence**, como deve.
Se bumpássemos a `version` no bulk, esse cashout legítimo levaria `BetConcurrencyError` (409) e o jogador
perderia um ganho devido. O fencing por `version` existe para serializar **escritas concorrentes da mesma
aposta**; a liquidação em massa é uma transição terminal que não compete com ninguém exceto o cashout
legítimo (que deve ganhar). Reconciliação no boot (`reconcile` trata rodada `CRASHED`) reexecuta o bulk
sem dano (idempotente).

### Trade-off consciente

O bulk UPDATE **não emite `BetLost` por agregado** (não passa pelo domínio). Para o WebSocket (Etapa 6),
o `LOST` individual é **derivável** do evento `round.crashed` + a query das apostas da rodada (o cliente
já sabe que crashou). Se um dia exigirem um evento por-aposta na liquidação, a saída é emitir **um** evento
de nível-rodada (`round.settled` com a lista) em vez de N — mantendo O(1). Não rever a abordagem bulk.

## Opção B considerada (documentada para escala) — work-set distribuído com `FOR UPDATE SKIP LOCKED`

Em vez do líder liquidar sozinho, ele só **sinaliza** (a rodada vira "a liquidar") e **todas as
instâncias** drenam o conjunto de apostas via:

```sql
SELECT id FROM bet
WHERE round_id = ? AND status = 'CONFIRMED'
FOR UPDATE SKIP LOCKED
LIMIT 100;
```

O `SKIP LOCKED` faz cada instância pegar um **lote disjunto** (as linhas travadas por outra são puladas,
não bloqueadas) → o trabalho **shardeia** entre instâncias sem coordenação. Correção continua vindo do
estado (`WHERE status='CONFIRMED'`) — **Redis lock seria redundante** (o próprio Postgres dá o lock de
linha, transacional, sem rede extra nem TTL a gerenciar). Detalhe didático completo (como o SKIP LOCKED
funciona, como os workers são feitos/ativados, a query e o loop de drenagem) em
`docs/study/etapa-05-settlement-distribuido-skip-locked.md`.

**Por que A e não B agora:** reality-check de custo — um crash game realista tem dezenas a baixas centenas
de apostas por rodada, a cada ~10s; o settlement são dezenas de UPDATEs locais por rodada = **trivial** pro
Postgres. O líder não é gargalo nessa escala, e a Opção A é muito mais simples (zero infra nova, zero
worker extra, menos superfície de teste). A Opção B só "ganha" num volume que este desafio não vê; fica
**registrada como caminho de scale-out** se o volume justificar.

## Consequências

- (+) Settlement simples, atômico-por-linha, idempotente, sem OCC bloodbath, sem mover dinheiro.
- (+) Cashout legítimo na borda do crash vence a corrida (version não-bumpada no bulk).
- (+) As instâncias não-líder seguem ocupadas (REST + SQS + relay) — não há desperdício.
- (−) Liquidação serial no líder; aceitável nesta escala. Scale-out = Opção B (mapeada).
- (−) Sem evento `BetLost` por agregado no bulk; `LOST` é derivável para o WebSocket (Etapa 6).
