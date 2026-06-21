# ADR 0016 — Curva não-autoritativa (transcendentais) + guardrail do drift do `setTimeout`

**Status:** Aceito (Etapa 4)

## Contexto

A curva (`@crash-game/curve`) usa `Math.exp`/`Math.log` para mapear tempo↔multiplicador, e o scheduler
agenda o crash com `setTimeout(elapsedForMultiplier(crashPoint))`. Dois riscos de correção surgem:

1. **Determinismo de transcendentais.** O ECMA-262 só exige arredondamento correto para `+ − × ÷ sqrt`;
   `Math.exp`/`Math.log` são *implementation-defined* (libm/CPU). Server (x64) e client (ARM/outro
   browser) podem divergir nos últimos bits da mantissa → o `floor` pode dar inteiros diferentes na borda.
2. **Drift do `setTimeout`.** O timer do Node/Bun dispara "no mínimo" após o delay, nunca pontualmente
   (GC/I/O → 50–200ms sob carga).

## Decisão

- **A curva é NÃO-AUTORITATIVA.** Serve só para **animação / aproximação wall-clock**. A **autoridade do
  jogo é unicamente o `crashPointX100` resolvido pela semente** (inteiro exato, provably fair). Documentado
  no cabeçalho do pacote `@crash-game/curve`. Round-trip da inversa é testado com **tolerância**, não
  bit-exato. (O dinheiro já é blindado por BigInt no domínio, Etapa 3.)
- **Guardrail do drift:** quando o `setTimeout` dispara, `Round.crash()` **NÃO** recomputa o multiplicador
  por `Date.now()` — apenas transiciona o estado e usa o `crashPointX100` **imutável** desde o `open()`.
  Confiar no relógio no disparo anunciaria um crash **maior** que o definido pela semente → quebraria o
  provably fair. O drift afeta só *quando* anuncia (cosmético; o evento do servidor na Etapa 6 corrige o
  client), nunca *o valor*.

## Consequências

- (+) Provably fair preservado independentemente de arquitetura/carga.
- (+) Frontend e backend concordam no **resultado** (crashPoint), mesmo que a animação tenha micro-drift.
- (−) O multiplicador exibido pode divergir por alguns ms entre clientes — corrigido por ticks de resync
  (Etapa 6). Aceito (cosmético).
