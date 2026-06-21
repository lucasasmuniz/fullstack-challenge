# ADR 0007 — `@crash-game/curve` como Shared Kernel com guardrail estrito

**Status:** Aceito

## Contexto

A curva do crash precisa ser **idêntica** no servidor (autoridade do crash) e no cliente (animação do
multiplicador entre os ticks de resync). Se as fórmulas divergirem, o número na tela não bate com o
ponto real de crash — péssima UX e aparência de manipulação. Há duas formas de garantir a concordância:
uma fonte única (pacote compartilhado) ou duas cópias (duplicação). Compartilhar código entre backend
e frontend levanta, com razão, a suspeita de acoplamento indevido.

## Decisão

A fórmula vive num **pacote compartilhado** `@crash-game/curve`, consumido pelo **Game** e pelo
**frontend** (Shared Kernel). Para que isso seja o acoplamento de **menor** custo (e não um vazamento
de backend), vale um **guardrail estrito**:

- O pacote contém **apenas math pura** da curva: `multiplierAt(elapsedMs, growthRate)` e a inversa
  `elapsedForMultiplier(...)`. Sem efeito colateral, sem infra, sem regra de negócio.
- **NUNCA** entram no pacote: geração do crash point, `server_seed`, house edge ou qualquer
  autoridade do jogo. Isso é **server-only** (`ProvablyFairService`; seed revelada só após o crash).
- `growthRate` é **parâmetro** (env no server, enviado ao client) — não fica "assado" no pacote.
- É dependência de **build-time** (cada lado faz bundle do próprio artefato); não há acoplamento de
  runtime nem de deploy entre Game e frontend.

Distribuição: em **monorepo** (caso atual), via `workspace:*` (symlink, source cru, sem build). Se um
dia virar **multi-repo**, publica-se o pacote num registry com `dist` (JS + `.d.ts`) e semver.

## Consequências

- (+) Uma fonte da verdade da curva; concordância garantida em compile-time.
- (+) Provably fair preservado: com só a math, o cliente não consegue prever onde vai crashar.
- (+) Sem acoplamento de runtime — Game e frontend deployam em instâncias separadas.
- (−) Exige disciplina para manter o guardrail (nada de lógica de autoridade no pacote) — daí este ADR.
- (−) Em multi-repo, custo de versionamento (registry + semver), mitigado pela estabilidade da curva.
