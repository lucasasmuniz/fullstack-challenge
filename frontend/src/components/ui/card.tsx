import { cn } from "@/lib/utils";

/** Painel base — superfície + borda sutil do design. */
export function Card({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-xl border border-line bg-surface",
        className,
      )}
      {...props}
    />
  );
}
