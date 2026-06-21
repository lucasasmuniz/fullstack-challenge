# ADR 0017 — Public seed via beacon externo (anti-pré-computação real)

**Status:** Aceito (Etapa 4 — fix de revisão)

## Contexto

O esquema provably fair (ADR 0011) mistura um `publicSeed` no HMAC para defender contra
**pré-computação** (o operador escolher/grindar uma cadeia favorável antes de comprometê-la). Essa
propriedade **só existe se o `publicSeed` for imprevisível pelo operador no momento em que ele gera a
cadeia**. A 1ª implementação usava um `publicSeed` **constante de env** — conhecido na geração → a
defesa anti-pré-computação **não existia** (degradava ao modelo commit-only). A revisão apontou isso.

## Decisão

O `publicSeed` vem de um **beacon de entropia externo e imprevisível**, commitado **antes** da geração
e revelado **depois**:

1. Ao **gerar** a cadeia, persistimos o `rootCommitment` e **commitamos uma rodada futura** do beacon
   (`beacon_round`), que ainda não foi produzida — desconhecida por todos, inclusive o operador.
2. Na **ativação** da cadeia (após o commit), **resolvemos** o `beacon_round` no valor de entropia e o
   fixamos como `publicSeed`; só então a cadeia é consumível.

Beacon usado: **drand** (League of Entropy) — HTTP, valor novo a cada poucos segundos, feito para isto.
Alternativa equivalente documentada: **hash de um bloco BTC futuro** (modelo bustabit) — mesma garantia,
mas exige esperar ~10 min/bloco; o drand é mais prático para o ciclo de ~20s do jogo.

**Fallback offline (obrigatório p/ `docker:up` zero-manual):** se o beacon estiver inacessível (CI/sem
internet), o `publicSeed` cai para **CSPRNG** com **WARN** — o jogo sobe, mas a propriedade
anti-pré-computação fica **degradada naquela cadeia** (volta ao commit-only). Tudo configurável por env
(`BEACON_ENABLED`, `BEACON_BASE_URL`, `BEACON_CHAIN_HASH`, `BEACON_ROUND_LEAD`, timeouts).

## Consequências

- (+) Anti-pré-computação **real**: a cadeia é comprometida antes de a entropia existir → o operador não
  pode grindar baseSeeds para mirar resultados.
- (+) Verificável por terceiros: a rodada do beacon é pública (drand/explorer BTC).
- (−) Dependência externa no caminho de ativação da cadeia (mitigada por timeout + fallback CSPRNG).
- (−) Boot da 1ª cadeia espera a rodada futura do beacon (poucos segundos, `BEACON_ROUND_LEAD`).
- (−) Ataque teórico de *miner-withholding* (no caso BTC) — economicamente irracional e mitigável; drand
  (limiar t-de-n) não tem esse vetor.
