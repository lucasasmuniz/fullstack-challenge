"use client";

import { useAuth } from "react-oidc-context";
import { startSignin } from "@/lib/auth";

/**
 * Ações de auth centralizadas (DRY). `register` usa `prompt=create` (OIDC) → o Keycloak abre
 * direto o formulário de cadastro (requer `registrationAllowed` no realm). O caminho atual vai no
 * `state` do OIDC para o callback devolver o usuário à tela de origem (ex.: voltar pro jogo).
 * `startSignin` limpa state stale antes (evita o erro de token/state inválido ao re-logar).
 */
export function useAuthActions() {
  const auth = useAuth();
  const returnTo = () =>
    typeof window === "undefined"
      ? "/lobby"
      : window.location.pathname + window.location.search;
  return {
    login: () => void startSignin({ state: { returnTo: returnTo() } }),
    register: () =>
      void startSignin({ prompt: "create", state: { returnTo: returnTo() } }),
    logout: () => void auth.signoutRedirect(),
  };
}
