# ADR 0008 — `@crash-game/nestjs-kit` como pacote compartilhado

**Status:** Aceito

## Contexto

A Etapa 1 introduz, nos **dois** serviços NestJS, três peças idênticas: (1) o guard de autenticação
JWKS, (2) o decorator `@CurrentUser` (+ `@Public` e o tipo `AuthenticatedUser`), e (3) o helper de
config de env (validação `zod` + token de DI `ENV`). Duplicar isso em `games` e `wallets` significaria
manter duas cópias do código mais sensível do sistema (autenticação) em sincronia manual — fonte clássica
de drift e de bug de segurança ("corrigi num serviço e esqueci no outro").

A regra de "shared" do projeto (ver journal da Etapa 0): um pacote só vira `@crash-game/*` se tiver
**≥2 consumidores** e for **genérico/estável**. Guard + decorator + env-loader atendem: ambos os
serviços consomem, e nada ali é específico de carteira ou de jogo.

## Decisão

Criar o pacote **`@crash-game/nestjs-kit`** com a cola de infraestrutura NestJS reutilizável:

- `auth/`: `JwksGuard` (CanActivate), `@CurrentUser`, `@Public`, `JwtVerifier` (porta) +
  `JoseJwtVerifier` (adapter jose), e o `AuthModule.forRoot({ issuer, jwksUri })` que registra o guard
  como `APP_GUARD` global (secure-by-default).
- `config/`: `loadEnv(schema)` (valida `process.env` com `zod`, fail-fast) e o token `ENV` para DI.

Cada serviço define **só o que é seu**: o `zod` schema das próprias variáveis (`env.schema.ts`) e a
config do próprio banco. A mecânica compartilhada mora no kit.

`nestjs-kit` declara `@nestjs/*`, `reflect-metadata` e `rxjs` como **peerDependencies** (quem fornece é o
serviço), e `jose` + `zod` como dependências diretas (são detalhe de implementação do kit).

## Consequências

- (+) Uma única implementação da autenticação; corrigir/endurecer num lugar vale para os dois serviços.
- (+) O guard fica testável isolado (unit no próprio pacote, com `JwtVerifier` fake e chaves in-memory).
- (+) Segue o mesmo padrão já aceito para `@crash-game/persistence` (preset de infra compartilhado).
- (−) Mais um pacote no monorepo. Mitigado: é fino, infra-only e tem dono claro (este ADR).
- (−) Acoplamento de **build-time** entre serviços e o kit (via `workspace:*`); sem acoplamento de
  runtime/deploy (cada serviço faz o próprio bundle).
