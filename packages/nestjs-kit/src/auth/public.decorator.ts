import { SetMetadata, type CustomDecorator } from "@nestjs/common";

/** Chave de metadata lida pelo {@link JwksGuard} para liberar uma rota. */
export const IS_PUBLIC_KEY = "isPublic";

/**
 * Marca uma rota (ou controller) como pública — opt-out do guard global
 * secure-by-default. Use em endpoints que o anônimo pode acessar
 * (ex: `GET /games/rounds/current`, `GET /health`).
 */
export const Public = (): CustomDecorator => SetMetadata(IS_PUBLIC_KEY, true);
