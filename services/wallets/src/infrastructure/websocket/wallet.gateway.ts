import { Inject, Logger } from "@nestjs/common";
import {
  WebSocketGateway,
  WebSocketServer,
  type OnGatewayConnection,
  type OnGatewayInit,
} from "@nestjs/websockets";
import { JWT_VERIFIER, type JwtVerifier } from "@crash-game/nestjs-kit";
import {
  extractHandshakeToken,
  gatewayOptions,
  getSocketUser,
  setSocketUser,
} from "@crash-game/realtime";
import {
  userRoom,
  type BalanceUpdatedPayload,
} from "@crash-game/realtime-contracts";
import { RealtimeEvent } from "@crash-game/realtime-contracts";
import type { Server, Socket } from "socket.io";
import type { RealtimePublisher } from "../../application/realtime.port";

/**
 * Gateway WS da Wallet (server→client). Handshake **estrito** (Risco 3): sem token válido →
 * **rejeita** a conexão (saldo é privado; sem identidade não há sala). Cada cliente entra só na
 * sua sala `user:{sub}`. Implementa {@link RealtimePublisher} (push direcionado de saldo).
 * WebSocket-only + path casado com o Kong (Risco 2).
 */
@WebSocketGateway(gatewayOptions("/wallets/socket.io/"))
export class WalletGateway
  implements OnGatewayInit, OnGatewayConnection, RealtimePublisher
{
  private readonly logger = new Logger(WalletGateway.name);

  @WebSocketServer()
  private server?: Server;

  constructor(@Inject(JWT_VERIFIER) private readonly verifier: JwtVerifier) {}

  afterInit(server: Server): void {
    // Handshake estrito: token ausente/ inválido → rejeita (next com erro).
    server.use((socket: Socket, next: (err?: Error) => void) => {
      const token = extractHandshakeToken(socket);
      if (!token) {
        next(new Error("unauthorized"));
        return;
      }
      void this.verifier
        .verify(token)
        .then((user) => {
          setSocketUser(socket, user);
          next();
        })
        .catch(() => {
          next(new Error("unauthorized"));
        });
    });
  }

  handleConnection(socket: Socket): void {
    const user = getSocketUser(socket);
    if (!user) {
      // Não deveria ocorrer (handshake estrito), mas fecha por segurança.
      socket.disconnect(true);
      return;
    }
    void socket.join(userRoom(user.sub));
  }

  emitBalance(playerId: string, payload: BalanceUpdatedPayload): void {
    this.server?.to(userRoom(playerId)).emit(RealtimeEvent.BalanceUpdated, payload);
  }
}
