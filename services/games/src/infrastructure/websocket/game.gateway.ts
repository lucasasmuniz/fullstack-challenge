import { Inject, Logger } from "@nestjs/common";
import {
  WebSocketGateway,
  WebSocketServer,
  type OnGatewayConnection,
  type OnGatewayInit,
} from "@nestjs/websockets";
import { JWT_VERIFIER, type JwtVerifier } from "@crash-game/nestjs-kit";
import {
  PUBLIC_ROOM,
  userRoom,
  type RealtimeEvent,
  type RealtimeEventPayloads,
} from "@crash-game/realtime-contracts";
import type { Server, Socket } from "socket.io";
import {
  extractHandshakeToken,
  gatewayOptions,
  getSocketUser,
  setSocketUser,
} from "@crash-game/realtime";
import type { RealtimePublisher } from "../../application/realtime.port";

/**
 * Gateway WS do Game (server→client). Handshake **híbrido** (Risco 3): token ausente/ inválido →
 * anônimo (só sala pública); token válido → pública + `user:{sub}`. Implementa o
 * {@link RealtimePublisher} (emissão pública). WebSocket-only + path casado com o Kong (Risco 2).
 */
@WebSocketGateway(gatewayOptions("/games/socket.io/"))
export class GameGateway
  implements OnGatewayInit, OnGatewayConnection, RealtimePublisher
{
  private readonly logger = new Logger(GameGateway.name);

  @WebSocketServer()
  private server?: Server;

  constructor(@Inject(JWT_VERIFIER) private readonly verifier: JwtVerifier) {}

  afterInit(server: Server): void {
    // Middleware de handshake: valida o token (se houver) e anexa o usuário ao socket.
    // Híbrido → erro de verificação NÃO derruba a conexão; rebaixa para anônimo.
    server.use((socket: Socket, next: (err?: Error) => void) => {
      const token = extractHandshakeToken(socket);
      if (!token) {
        next();
        return;
      }
      void this.verifier
        .verify(token)
        .then((user) => {
          setSocketUser(socket, user);
          next();
        })
        .catch(() => {
          // Token inválido/expirado: segue anônimo (o REST cuida do refresh).
          next();
        });
    });
  }

  handleConnection(socket: Socket): void {
    void socket.join(PUBLIC_ROOM);
    const user = getSocketUser(socket);
    if (user) {
      void socket.join(userRoom(user.sub));
    }
  }

  emitToPublic<E extends RealtimeEvent>(
    event: E,
    payload: RealtimeEventPayloads[E],
  ): void {
    // Server pode não estar pronto se um evento dispara antes do afterInit — no-op seguro.
    this.server?.to(PUBLIC_ROOM).emit(event, payload);
  }
}
