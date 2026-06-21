"use client";

import { cn } from "@/lib/utils";

/** Switch on/off acessível (role=switch). */
export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={cn(
        "relative h-6 w-11 shrink-0 rounded-full transition-colors",
        checked ? "bg-primary" : "bg-line",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 size-5 rounded-full bg-base transition-transform",
          checked ? "translate-x-[22px]" : "translate-x-0.5",
        )}
      />
    </button>
  );
}
