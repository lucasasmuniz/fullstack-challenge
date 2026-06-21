# ADR 0009 — Validação de JWT via JWKS na aplicação (Kong só roteia)

**Status:** Aceito

## Contexto

R6 exige "Auth via IdP — backend valida JWT". O Keycloak emite access tokens assinados em **RS256**;
o backend precisa verificar **assinatura + `iss` + `exp`** e extrair o `sub` (identidade dona do
recurso). A chave pública é obtida via **JWKS** (`/protocol/openid-connect/certs`), que lista as chaves
por `kid` e suporta rotação.

Três caminhos foram considerados para **onde** validar:

- **A — Chave fixa no realm + plugin `jwt` do Kong (OSS).** O plugin `jwt` do Kong OSS **não busca
  JWKS**: exige a chave pública registrada declarativamente. Como o Keycloak gera as chaves no boot,
  seria preciso **fixar um keypair no realm-export** e comitá-lo. Valida na borda, mas mata a rotação e
  versiona material de assinatura no repo — anti-pattern.
- **B — Kong só roteia; cada serviço valida via JWKS (`jose`).** Validação moderna, rotação automática,
  zero chave no repo, infra simples. A borda não é fronteira de auth.
- **C — Imagem Kong custom com plugin JWKS community (ex: `jwt-keycloak`).** Valida por JWKS **na
  borda** (padrão de produção: gateway autentica, serviço autoriza), mas acopla a um plugin Lua de
  terceiros e a um Dockerfile custom do Kong — um ponto de fragilidade no `bun run docker:up`, que é
  requisito **eliminatório** (R1).

## Decisão

Adotar **B**: **Kong segue apenas roteando** e **cada serviço valida o JWT via JWKS** com `jose`
(`createRemoteJWKSet` + `jwtVerify`), encapsulado no `@crash-game/nestjs-kit` (ver ADR 0008). O guard é
**global secure-by-default**; rotas que o anônimo acessa (ex: `GET /games/rounds/current`, `/health`)
usam `@Public()`. Fixamos `algorithms: ["RS256"]` na verificação para impedir ataque de troca de
algoritmo.

Motivo do descarte de C: o ganho (validação JWKS na borda) é **teórico no ambiente local** (o Keycloak
não rotaciona chave durante uma demo), enquanto o custo (plugin community + imagem custom) ameaça o
zero-manual eliminatório. A decisão prioriza robustez operacional sobre vistosidade.

### Issuer dentro vs fora do Docker

O token é emitido com `iss = http://localhost:8080/realms/crash-game` (URL que o browser usa), mas o
serviço, dentro do Docker, alcança o Keycloak por `http://keycloak:8080`. Por isso há **duas** envs:
`KEYCLOAK_ISSUER` (público — valida o claim `iss`) e `KEYCLOAK_JWKS_URI` (interno — busca as chaves). O
Keycloak roda com `KC_HOSTNAME=http://localhost:8080` (+ `KC_HOSTNAME_BACKCHANNEL_DYNAMIC=true`) para o
`iss` ser **determinístico** independentemente de quem fez a request.

## Consequências

- (+) Padrão moderno: rotação de chave automática (JWKS), nenhum segredo/keypair no repo.
- (+) Zero-manual preservado — sem plugin custom no Kong, sem cirurgia no realm.
- (+) Autorização por dono do recurso fica junto da validação (mesmo lugar que lê o `sub`).
- (−) A borda **não** é fronteira de autenticação: requests sem token chegam ao serviço e são rejeitados
  (401) ali. Aceitável aqui; **em produção** a borda enforçaria JWKS (Kong Enterprise `openid-connect`
  ou o plugin community da opção C). Registrado para a discussão de trade-offs do README.
- (−) Cada serviço paga o custo de verificar o JWT (mitigado pelo cache do JWKS no `jose`).
