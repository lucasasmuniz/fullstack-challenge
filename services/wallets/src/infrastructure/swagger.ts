import type { INestApplication } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

/**
 * Monta o Swagger/OpenAPI em `/docs` (acesse direto na porta do serviço — ex.
 * `http://localhost:4002/docs`). Os paths exibidos são os **internos**; via Kong o prefixo
 * `/wallets` é adicionado (`strip_path:true`). `addBearerAuth` habilita o cadeado (cole o token).
 */
export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle("Crash Game — Wallet Service")
    .setDescription(
      "API REST da carteira do jogador (saldo, depósito, saque). Acesso via Kong: prefixe as " +
        "rotas com `/wallets` (ex.: `GET /wallets/me`). Crédito/débito do **jogo** (aposta/cashout) " +
        "não são REST — chegam pela saga SQS. O saldo é empurrado em tempo real por WebSocket " +
        "(`/wallets/socket.io/`, conexão autenticada).",
    )
    .setVersion("1.0")
    .addServer("http://localhost:8000/wallets", "Via Kong (gateway — acesso oficial)")
    .addServer("http://localhost:4002", "Direto na porta do serviço (debug)")
    .addBearerAuth(
      { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      "bearer",
    )
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("docs", app, document);
}
