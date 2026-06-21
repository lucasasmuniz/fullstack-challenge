"use client";

import { cn } from "@/lib/utils";

export interface SegmentedOption<T extends string> {
  readonly value: T;
  readonly label: string;
}

/**
 * Controle segmentado (pill tabs) do design — usado em "Manual | Auto" e toggles (24h/semana).
 * Controlado: `value` + `onChange`. Acessível via role=tablist.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={cn(
        "inline-flex gap-0.5 rounded-[9px] border border-line bg-base/60 p-[3px]",
        className,
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              "rounded-md px-3.5 py-1.5 font-display text-[12.5px] font-semibold transition-colors",
              active ? "bg-elevated text-fg" : "text-muted hover:text-fg",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
