# ADR 0011 — Provably Fair: hash chain reversa + public seed (derivação BigInt)

**Status:** Aceito

## Contexto

O crash point de cada rodada deve ser **comprometido antes** das apostas e **verificável depois**
pelo jogador (R8). A casa não pode poder mudar o resultado após ver as apostas. O README cita hash
chains, HMAC, seeds e house edge. Há esquemas alternativos (commit-reveal por rodada, client seed
por jogador, Merkle) com trade-offs diferentes. O crash é um jogo de **rodada compartilhada**: um
único crash point vale para todos os jogadores da rodada.

## Decisão

Esquema **C — hash chain reversa (Lamport) + public seed** (híbrido tipo bustabit):

- **Commitment:** `serverSeedHash = sha256(serverSeed)` publicado no início da rodada; `serverSeed`
  revelado **só após o crash**.
- **Cadeia reversa:** geração `S_{n-1} = sha256(S_n)` de `S_N` até `S_0` (Root Commitment publicado
  antes de qualquer rodada); **consumo reverso** (`S_N` primeiro) → `sha256(seedDaRodada)` devolve a
  seed da rodada anterior (elo verificável até o root).
- **Derivação:** `crashX100 = floor((100·2^52 − h) / (2^52 − h))`, com
  `h = BigInt('0x' + HMAC_SHA256(serverSeed, publicSeed).slice(0,13))` (52 bits). O `publicSeed` é um
  salt externo incontestável que **anula pré-computação** da cadeia pela casa — **desde que seja
  imprevisível na geração**. Por isso ele vem de um **beacon externo commitado antes / revelado depois**
  (drand, ou hash de bloco BTC futuro), não de uma constante. Mecanismo e fallback offline → **ADR 0017**.
- **House edge:** crash instantâneo em `1.00x` quando `h % instantBustDivisor === 0` →
  probabilidade **exata** `1/instantBustDivisor` (101 → ~0.99%). Configurável.
- **BigInt obrigatório:** `100·2^52 ≈ 4.5×10^17` estoura o safe-integer do `number`; em float dois
  ambientes derivariam crash points diferentes da mesma seed, quebrando a verificação. Tudo em
  `bigint`; conversão a `number` só após o `cap`.

Por que não B (client seed por jogador): num crash o crash point é compartilhado — client seed por
jogador não modela e ainda adiciona estado. A cadeia (A/C) prova a pré-determinação da sequência; o
`publicSeed` (C) fecha o vetor de pré-computação com custo marginal.

A math pura vive no `ProvablyFairDomainService` (server-only, ADR 0007). O agregado `Round` **consome
a seed resolvida** e não conhece a estrutura da cadeia.

## Consequências

- (+) Verificação independente forte: commitment + recomputação + elo da cadeia até o root.
- (+) `publicSeed` neutraliza pré-computação; sem estado por jogador.
- (+) Determinismo exato (BigInt) → verificação reproduzível.
- (−) Geração/persistência da cadeia (cold storage) e rotação são infra (Etapa 4) — ver ADR 0013.
- (−) `crashPointX100` é autoridade do servidor: a apresentação nunca pode serializá-lo antes do crash.
