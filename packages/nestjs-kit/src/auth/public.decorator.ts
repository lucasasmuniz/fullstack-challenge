import { SetMetadata, type CustomDecorator } from "@nestjs/common";

export const IS_PUBLIC_KEY = "isPublic";

/** Marca uma rota como pública — opt-out do guard global secure-by-default. */
export const Public = (): CustomDecorator => SetMetadata(IS_PUBLIC_KEY, true);
