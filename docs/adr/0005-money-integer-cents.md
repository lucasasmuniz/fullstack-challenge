# ADR 0005 — Precisão monetária: inteiro em centavos (zero float)

**Status:** Aceito

## Contexto

Ponto flutuante para dinheiro causa erros de arredondamento e é **desclassificação imediata** no
desafio. Há dinheiro real em jogo.

## Decisão

- Dinheiro sempre **inteiro em centavos** (`BIGINT` no banco), encapsulado no VO `Money`
  (`@crash-game/money`). Nenhuma operação monetária usa `number` float.
- Multiplicador também inteiro: **× 100** (`247` = `2.47x`), inclusive no banco.
- `CHECK (balance_cents >= 0)` no banco + invariante no agregado.

## Consequências

- (+) Sem erro de arredondamento; cálculos determinísticos e testáveis.
- (−) Conversões de apresentação (centavos → "R$ x,yz") ficam na borda/frontend.
- `payout_cents = floor(amount_cents × multiplier / 100)` — arredondamento **floor** (a favor da casa),
  travado e determinístico. Mesma direção em todo o código.
