import { TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

/** Marca JUNGLEcrash — quadrado verde com ícone + wordmark. */
export function Logo({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <span className="grid size-[30px] place-items-center rounded-[9px] bg-primary text-ink shadow-glow">
        <TrendingUp className="size-[17px]" strokeWidth={3} />
      </span>
      <span className="font-display text-lg font-bold tracking-tight">
        JUNGLE<span className="text-primary">crash</span>
      </span>
    </div>
  );
}
