# ADR 0013 — Consumo de seeds: cold storage + job de rotação + buffer Valkey

**Status:** Aceito (execução na Etapa 4)

## Contexto

A hash chain reversa (ADR 0011) é consumida no sentido **oposto** ao da geração. Obter a seed da
próxima rodada a partir da atual exigiria **inverter** o SHA-256 (pre-image) — impossível. As saídas
reais são: recomputar do genesis a cada rodada (**O(N) por rodada**, ex.: 10M de hashes a cada ~20s →
derruba a CPU) ou **armazenar a cadeia** e ler por índice (**O(1)**). O crash consome ~**0,04 seeds/s**
(uma rodada global por vez), e o `RoundScheduler` é **single-leader** (lock no Valkey).

## Decisão

- **Cold storage da cadeia (Postgres):** pré-gerada por um **job background** (CSPRNG para a seed base;
  geração `N→0`; rotação ao se aproximar da exaustão). Leitura por índice = O(1). É **exigência
  matemática**, não otimização de throughput.
- **Buffer hot (Valkey) + consumo atômico (`LPOP`):** mantido apesar da baixa taxa, com justificativa
  **honesta**: a 0,04 req/s o ganho **não é throughput** (lookup por PK no Postgres é trivial), e sim
  **desacoplar o loop do banco** + **robustez a leader handoff** (não consumir a mesma seed duas vezes
  numa troca de líder) + demonstrar o padrão hot/cold (Valkey já está na stack).

## Consequências

- (+) Consumo O(1) e verificação O(1) (um `sha256` prova o elo).
- (+) Loop do jogo isolado de I/O relacional; consumo de seed robusto a handoff.
- (−) Custo de storage da cadeia (mitigável escolhendo `N` conforme o horizonte operacional) e de um job
  de geração/rotação.
- (−) Para **este** jogo (single-leader, baixa frequência) o buffer é hygiene/showcase, não necessidade
  de carga; o padrão só **paga** de fato num consumidor multi-instância de alta frequência (ex.: dice).
