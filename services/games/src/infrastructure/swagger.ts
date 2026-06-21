import type { INestApplication } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

/**
 * Monta o Swagger/OpenAPI em `/docs` (acesse direto na porta do serviço — ex.
 * `http://localhost:4001/docs`). Os paths exibidos são os **internos** do serviço; via Kong o
 * prefixo `/games` é adicionado (`strip_path:true`). `addBearerAuth` habilita o cadeado para os
 * endpoints autenticados (cole o access token do Keycloak).
 */
export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle("Crash Game — Game Service")
    .setDescription(
      "API REST do serviço de jogo (rodadas, apostas, cashout, provably fair). " +
        "Acesso via Kong: prefixe as rotas com `/games` (ex.: `GET /games/rounds/current`). " +
        "Crédito/débito de saldo **não** são REST — fluem pela saga SQS. Eventos em tempo real " +
        "vão por WebSocket (`/games/socket.io/`).",
    )
    .setVersion("1.0")
    .addBearerAuth(
      { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      "bearer",
    )
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("docs", app, document);
}
