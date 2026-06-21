"use client";

import { useAuth } from "react-oidc-context";

export interface CurrentUser {
  readonly isAuthenticated: boolean;
  readonly isLoading: boolean;
  readonly username: string;
  readonly initials: string;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Username (`preferred_username` do JWT) + iniciais para o avatar. */
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
    initials: username ? initialsOf(username) : "?",
  };
}
