import type { AuthenticatedUser } from "@crash-game/nestjs-kit";
import type { Socket } from "socket.io";

/** Dados que anexamos ao socket após o handshake (tipagem de `socket.data`, sem `any`). */
export interface SocketData {
  user?: AuthenticatedUser;
}

/**
 * Extrai o token do handshake: `auth.token` (forma idiomática do socket.io-client) ou, como
 * fallback, o header `Authorization: Bearer`. Retorna `null` se não houver.
 */
export function extractHandshakeToken(socket: Socket): string | null {
  // `handshake.auth`/headers vêm com `any` do socket.io → contém em `unknown` e narrow por typeof.
  const authToken: unknown = socket.handshake.auth?.token;
  if (typeof authToken === "string" && authToken.length > 0) {
    return authToken;
  }
  const header: unknown = socket.handshake.headers.authorization;
  const value: unknown = Array.isArray(header) ? header[0] : header;
  if (typeof value !== "string") {
    return null;
  }
  const [scheme, token] = value.split(" ");
  return scheme?.toLowerCase() === "bearer" && token ? token : null;
}

export function getSocketUser(socket: Socket): AuthenticatedUser | undefined {
  return (socket.data as SocketData).user;
}

export function setSocketUser(socket: Socket, user: AuthenticatedUser): void {
  (socket.data as SocketData).user = user;
}
