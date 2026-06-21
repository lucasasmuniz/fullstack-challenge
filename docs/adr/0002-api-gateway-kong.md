# ADR 0002 — API Gateway: Kong

**Status:** Aceito

## Contexto

Precisamos de um ponto único de entrada na frente dos microsserviços (roteamento + concerns
transversais: validação de JWT, rate limiting, CORS, logging). Opções: Kong (já no scaffold) ou
AWS API Gateway via LocalStack.

## Decisão

Usar **Kong** em modo DB-less (declarativo, `kong.yml`). Kong valida o **JWT do Keycloak na borda**
(plugin `jwt`, chave pública RS256 do realm) e aplica **rate limiting** nas rotas sensíveis.

## Consequências

- (+) Já configurado; sobe instantâneo; gateway de produção real.
- (+) Entrega 2 bônus de borda: validação de JWT centralizada e rate limiting.
- (−) Não é o AWS API Gateway exato da vaga — documentamos no README o equivalente AWS
  (API Gateway + Cognito/ALB) como trade-off de produção.
- Defesa em profundidade: além da borda, cada serviço NestJS **re-valida** o JWT via JWKS.
