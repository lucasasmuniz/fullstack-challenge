/**
 * `@crash-game/realtime` — infraestrutura WS **compartilhada** entre os serviços (Game/Wallet):
 * o `IoAdapter` com adapter Valkey (fanout entre instâncias), as opções de gateway
 * (WebSocket-only + path + CORS) e os helpers de handshake/auth do socket. Os **gateways em si**
 * (regras de sala/auth híbrida vs estrita) ficam em cada serviço.
 */
export { ValkeyIoAdapter } from "./valkey-io-adapter";
export { gatewayOptions } from "./ws-options";
export {
  extractHandshakeToken,
  getSocketUser,
  setSocketUser,
  type SocketData,
} from "./handshake-token";
