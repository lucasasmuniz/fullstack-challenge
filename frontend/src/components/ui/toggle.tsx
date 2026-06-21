"use client";

import { cn } from "@/lib/utils";

/** Switch on/off acessível (role=switch). Knob claro; `disabled` bloqueia o clique de verdade. */
export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full px-0.5 transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        checked ? "bg-primary" : "bg-line",
      )}
    >
      <span
        className={cn(
          "size-5 rounded-full bg-white shadow transition-transform duration-200",
          checked ? "translate-x-5" : "translate-x-0",
        )}
      />
    </button>
  );
}
