# ADR 0015 — Single runner do scheduler: leader lease (Valkey) + fencing por `Round.version`

**Status:** Aceito (Etapa 4)

## Contexto

O `RoundScheduler` é o **loop autoritativo** do jogo (abre/inicia/crasha/liquida rodadas). Precisa de
**exatamente um runner** mesmo com múltiplas instâncias do Game (escala horizontal, deploy rolling).
Duas instâncias dirigindo o loop → rodadas duplicadas / transições conflitantes. Opções: lock distribuído
dedicado (redlock) ou um lease simples no Valkey. A literatura (Kleppmann) mostra que **nenhum** lock de
Redis garante exclusão mútua sob *stop-the-world* (GC/stall) — sempre há janela em que dois nós se acham
líderes (split-brain). A correção real exige **fencing token**.

## Decisão

- **Lease no Valkey** (`SET scheduler:leader <token> NX PX <ttl>`; renovação a cada `ttl/3` e release via
  **Lua escopado por dono**). Elege 1 líder e evita trabalho duplicado.
- **Fencing por `Round.version` (a correção):** todo `save` é um **UPDATE condicional**
  (`WHERE id=? AND version=expected`). Um líder obsoleto (lease expirado, mas timer ainda dispara) que
  tente persistir uma transição com `version` defasada afeta **0 linhas** → `RoundConcurrencyError`; o
  estado **não** corrompe. O `version` é o fencing token monotônico que o Redis lock sozinho não dá.
- **Emergency Step-Down (higiene):** se a renovação falhar (não-dono ou erro de rede), o scheduler limpa
  os timers (`clearTimeout`/`clearInterval`), zera `isLeader` e volta a tentar adquirir. Cobre a janela
  TOCTOU sem desperdiçar CPU/log nem virar líder-zumbi.
- **Recovery no boot:** ao assumir, antes de abrir rodada nova, reconcilia uma rodada não-terminal presa
  (timer perdido com o processo) pelos timestamps persistidos (start/crash/settle imediato ou rearmar
  timers).

## Consequências

- (+) Correção garantida pelo DB (version), não pelo lock — robusto a split-brain/GC.
- (+) Lease sem dependência extra (Valkey já na stack); step-down e recovery deixam o sistema
  auto-curável em deploy/restart/partição.
- (−) A checagem `isLeader` no loop é **advisory** (pode estar momentaneamente errada) — por isso o
  fencing é obrigatório, não opcional.
- (−) Em partição, há breve janela de líder duplicado (trabalho desperdiçado, sem corrupção) — aceito.
