import { cn, formatMultiplier } from "@/lib/utils";

/** Faixa de cor por crash point (×100): <2.00x vermelho, ≥2.00x verde, ≥10.00x verde forte+glow. */
function rangeClass(x100: number): string {
  if (x100 >= 1000)
    return "text-base bg-primary border-primary shadow-[0_0_14px_rgba(124,252,74,.4)]";
  if (x100 >= 200) return "text-primary bg-primary/10 border-primary/25";
  return "text-danger bg-danger/10 border-danger/25";
}

/** Pílula do histórico de crashes. */
export function MultiplierPill({
  x100,
  className,
}: {
  x100: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "rounded-full border px-2.5 py-1 font-mono text-xs font-semibold",
        rangeClass(x100),
        className,
      )}
    >
      {formatMultiplier(x100)}
    </span>
  );
}
