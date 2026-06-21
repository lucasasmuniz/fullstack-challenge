import { cn } from "@/lib/utils";

/** Chip de atalho (QuickAmount): +5, +10, 1/2, Max… */
export function Chip({
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        "rounded-full border border-line bg-base/60 px-3.5 py-2 font-mono text-[13px] font-medium text-muted transition-colors hover:border-primary-deep hover:text-fg disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
