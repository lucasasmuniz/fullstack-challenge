import { useSyncExternalStore } from "react";

const emptySubscribe = () => () => {};

/**
 * `false` no SSR/primeira renderização de hidratação, `true` no client — sem setState-em-effect
 * (padrão SSR-safe recomendado). Usado para montar só no browser o que toca `window` (OIDC).
 */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}
