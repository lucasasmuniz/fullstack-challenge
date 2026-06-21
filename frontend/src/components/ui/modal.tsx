"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Shell de modal (shadcn/Dialog) — overlay + card com header (ícone/título/sub/close). Fecha no
 * Escape e no clique no backdrop; trava o scroll do body. NUNCA usado para bet/cashout (regra do
 * design: aposta é inline). `aria-modal` + role=dialog para a11y.
 */
export function Modal({
  title,
  subtitle,
  icon: Icon,
  onClose,
  children,
  maxWidth = "max-w-lg",
}: {
  title: string;
  subtitle?: string;
  icon: LucideIcon;
  onClose: () => void;
  children: ReactNode;
  maxWidth?: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-80 flex items-center justify-center bg-[#060706]/75 p-4 backdrop-blur-sm"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "flex max-h-[88vh] w-full flex-col overflow-hidden rounded-xl border border-line bg-[#0E100E] shadow-[0_24px_80px_rgba(0,0,0,.6)]",
          maxWidth,
        )}
      >
        <div className="flex items-center gap-3 border-b border-line px-6 py-5">
          <span className="grid size-[38px] place-items-center rounded-[10px] border border-line bg-elevated text-primary">
            <Icon className="size-[18px]" />
          </span>
          <div className="flex-1">
            <div className="font-display text-lg font-bold tracking-tight">{title}</div>
            {subtitle && <div className="mt-0.5 text-xs text-faint">{subtitle}</div>}
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="grid size-[34px] place-items-center rounded-[9px] border border-line bg-surface text-muted transition-colors hover:border-primary-deep hover:text-fg"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
