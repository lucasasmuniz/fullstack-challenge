"use client";

import { useEffect, useRef, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

/** Centavos → "20,00" (sem símbolo; o R$ é prefixo separado). */
function formatReais(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Texto pt-BR ("1.234,56" ou "20") → centavos inteiros (NaN se vazio/ inválido). */
function parseReais(text: string): number {
  const normalized = text.replace(/\./g, "").replace(",", ".").replace(/[^\d.]/g, "");
  if (normalized === "") return NaN;
  return Math.round(parseFloat(normalized) * 100);
}

/**
 * Input de valor em centavos com stepper +/- e prefixo R$. Controlado (`valueCents`/`onChange`).
 * Edição livre enquanto focado; clamp em [min,max] no blur. `error` desenha a borda vermelha.
 */
export function NumberInput({
  valueCents,
  onChange,
  step = 500,
  min = 0,
  max,
  error,
  disabled,
}: {
  valueCents: number;
  onChange: (cents: number) => void;
  step?: number;
  min?: number;
  max?: number;
  error?: string;
  disabled?: boolean;
}) {
  const [text, setText] = useState(() => formatReais(valueCents));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setText(formatReais(valueCents));
  }, [valueCents]);

  const clamp = (cents: number) =>
    Math.max(min, max != null ? Math.min(max, cents) : cents);

  const bump = (delta: number) => {
    const next = clamp(valueCents + delta);
    onChange(next);
    setText(formatReais(next));
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div
        className={cn(
          "flex h-[46px] items-center overflow-hidden rounded-[10px] border bg-base/60 transition-shadow",
          error ? "border-danger" : "border-line focus-within:border-primary-deep focus-within:shadow-[0_0_0_3px_rgba(124,252,74,.1)]",
          disabled && "opacity-50",
        )}
      >
        <button
          type="button"
          aria-label="Diminuir"
          disabled={disabled}
          onClick={() => bump(-step)}
          className="grid h-full w-9 shrink-0 place-items-center border-r border-line text-muted transition-colors hover:text-fg disabled:cursor-not-allowed"
        >
          <Minus className="size-4" />
        </button>

        <div className="flex min-w-0 flex-1 items-center gap-1 px-2">
          <span className="shrink-0 font-mono text-sm text-muted">R$</span>
          <input
            inputMode="decimal"
            disabled={disabled}
            value={text}
            onFocus={() => (focused.current = true)}
            onChange={(e) => {
              setText(e.target.value);
              const cents = parseReais(e.target.value);
              if (!Number.isNaN(cents)) {
                onChange(max != null ? Math.min(max, cents) : cents);
              }
            }}
            onBlur={() => {
              focused.current = false;
              const cents = clamp(parseReais(text) || 0);
              onChange(cents);
              setText(formatReais(cents));
            }}
            className={cn(
              "w-full min-w-0 bg-transparent text-right font-mono text-base font-semibold outline-none",
              error ? "text-danger" : "text-fg",
            )}
          />
        </div>

        <button
          type="button"
          aria-label="Aumentar"
          disabled={disabled}
          onClick={() => bump(step)}
          className="grid h-full w-9 shrink-0 place-items-center border-l border-line text-muted transition-colors hover:text-fg disabled:cursor-not-allowed"
        >
          <Plus className="size-4" />
        </button>
      </div>
      {error && <span className="text-[11px] text-danger">{error}</span>}
    </div>
  );
}
