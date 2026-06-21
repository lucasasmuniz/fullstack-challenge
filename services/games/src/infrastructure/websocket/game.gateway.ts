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
import { GameMetrics } from "../observability/game-metrics";

/**
 * Gateway WS do Game (server→client). Handshake **híbrido**: token ausente/ inválido →
 * anônimo (só sala pública); token válido → pública + `user:{sub}`. Implementa o
 * {@link RealtimePublisher} (emissão pública). WebSocket-only + path casado com o Kong.
 */
@WebSocketGateway(gatewayOptions("/games/socket.io/"))
export class GameGateway
  implements OnGatewayInit, OnGatewayConnection, RealtimePublisher
{
  private readonly logger = new Logger(GameGateway.name);

  @WebSocketServer()
  private server?: Server;

  constructor(
    @Inject(JWT_VERIFIER) private readonly verifier: JwtVerifier,
    private readonly metrics: GameMetrics,
  ) {}

  afterInit(server: Server): void {
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
    const start = performance.now();
    this.server?.to(PUBLIC_ROOM).emit(event, payload);
    this.metrics.recordWsEmit(performance.now() - start);
  }
}
