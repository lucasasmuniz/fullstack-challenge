"use client";

import { useAuth } from "react-oidc-context";

export interface CurrentUser {
  readonly isAuthenticated: boolean;
  readonly isLoading: boolean;
  readonly username: string;
}

/** Username (`preferred_username` do JWT) + flags de auth. As iniciais ficam no `Avatar`. */
export function useCurrentUser(): CurrentUser {
  const auth = useAuth();
  const profile = auth.user?.profile;
  const username =
    (profile?.preferred_username as string | undefined) ??
    (profile?.name as string | undefined) ??
    "";

  return {
    isAuthenticated: auth.isAuthenticated,
    isLoading: auth.isLoading,
    username,
  };
}
