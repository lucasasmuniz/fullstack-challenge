import type { ReactNode } from "react";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppHeader } from "@/components/layout/app-header";

/** Shell autenticado: guard OIDC + topbar. Cobre /lobby e /game. */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGuard>
      <div className="flex min-h-screen flex-col">
        <AppHeader />
        {children}
      </div>
    </AuthGuard>
  );
}
