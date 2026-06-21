import { io, type Socket } from "socket.io-client";
import { env } from "./env";

/**
 * Socket do Game (push server→client). Path casado com o Kong (`/games/socket.io/`,
 * strip_path:false) e o gateway. WebSocket-only (sem long-polling → dispensa sticky session).
 * Token (quando logado) vai em `auth.token` — o gateway é híbrido: anônimo assiste, token habilita
 * a sala privada. Reconexão automática do socket.io.
 */
export function createGameSocket(token?: string): Socket {
  return io(env.wsUrl, {
    path: "/games/socket.io/",
    transports: ["websocket"],
    auth: token ? { token } : {},
    reconnection: true,
    reconnectionDelay: 800,
    reconnectionDelayMax: 4000,
  });
}
