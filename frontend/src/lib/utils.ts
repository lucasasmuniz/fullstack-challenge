import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge condicional de classes Tailwind (padrão shadcn). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Formata centavos inteiros como BRL. Dinheiro no fio é `number` (centavos). */
export function formatBRL(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

/** Multiplicador inteiro ×100 → string "1.17x". */
export function formatMultiplier(x100: number): string {
  return `${(x100 / 100).toFixed(2)}x`;
}

/** Iniciais para avatar a partir de um nome/username ("ana.paula" → "AP"). */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
