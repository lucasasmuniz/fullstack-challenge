import type { GatewayMetadata } from "@nestjs/websockets";

const WS_CORS_ORIGIN = process.env.WS_CORS_ORIGIN ?? "*";

/**
 * Opções comuns dos gateways socket.io. WebSocket-only (sem long-polling): handshake é um único
 * Upgrade 101, dispensa sticky session. `path` casa exatamente o que o Kong encaminha (barra final
 * importa); o cliente deve espelhar `path` e `transports:['websocket']`.
 */
export function gatewayOptions(path: string): GatewayMetadata {
  return {
    path,
    transports: ["websocket"],
    allowUpgrades: false,
    cors: { origin: WS_CORS_ORIGIN },
  };
}
