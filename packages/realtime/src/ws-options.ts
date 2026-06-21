import type { GatewayMetadata } from "@nestjs/websockets";

/**
 * Origem permitida no CORS do handshake WS (Risco 4). Lida de `process.env` (decorator é
 * estático, não passa por DI); default `*` em dev. Seguro porque a auth é Bearer no handshake
 * (não cookie) → `*` não habilita request credenciado. Também declarada no env schema (doc).
 */
const WS_CORS_ORIGIN = process.env.WS_CORS_ORIGIN ?? "*";

/**
 * Opções comuns dos gateways socket.io. **WebSocket-only** (`transports:['websocket']` +
 * `allowUpgrades:false`, Risco 2b): sem long-polling → handshake é um único Upgrade 101, dispensa
 * sticky session e elimina o fallback de polling. `path` casa exatamente o que o Kong encaminha
 * (Risco 2a; barra final importa). O cliente deve espelhar `path` e `transports:['websocket']`.
 */
export function gatewayOptions(path: string): GatewayMetadata {
  return {
    path,
    transports: ["websocket"],
    allowUpgrades: false,
    cors: { origin: WS_CORS_ORIGIN },
  };
}
