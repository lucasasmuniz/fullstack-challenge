# ADR 0012 — Round e Bet como agregados separados (referência por ID)

**Status:** Aceito

## Contexto

O `GUIDELINE.md` original modelava `Bet` como **entidade dentro do agregado `Round`**. Um agregado é
um **limite de consistência transacional**: tudo dentro dele é carregado/salvo junto, sob uma trava de
concorrência. No crash, muitos jogadores apostam na **mesma** rodada dentro de uma janela curta
(~10s), e o `RoundScheduler` (single-leader) dirige as transições da rodada.

## Decisão

`Round` e `Bet` são **agregados separados**; a `Bet` referencia a rodada apenas por **`roundId`** (ID),
nunca por objeto.

- `Round` guarda só o estado da rodada (status, crash point, seeds, timings, version).
- `Bet` é raiz própria (amount, status, auto-cashout, payout, version) e referencia `roundId`.
- Invariante **cross-aggregate** "1 aposta por jogador por rodada" → **`UNIQUE(round_id, player_id)`**
  no banco (forte, não eventual; o INSERT duplicado falha na hora) — Etapa 5. A `Bet.place()` não tenta
  validar unicidade (não enxerga as outras apostas).

## Consequências

- (+) Apostas não contendem entre si nem com a linha da rodada → sem optimistic-lock storm na `version`
  do `Round` sob carga de apostas concorrentes.
- (+) Agregados pequenos e coesos = transações curtas; alinhado à regra DDD "uma transação toca um
  agregado".
- (−) A invariante de unicidade sai do domínio e vai para uma constraint de banco — trade-off consciente
  (documentado aqui e no `GUIDELINE.md`).
- (−) Dois modelos a coordenar na saga (Etapa 5): a confirmação/rejeição da `Bet` e o estado do `Round`.
