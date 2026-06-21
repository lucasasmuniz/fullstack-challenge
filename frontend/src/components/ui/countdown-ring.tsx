import { cn } from "@/lib/utils";

const R = 19;
const CIRC = 2 * Math.PI * R;

/** Anel de contagem regressiva da fase de apostas. `progress` 0..1 (1 = cheio). */
export function CountdownRing({
  seconds,
  progress,
  urgent,
  className,
}: {
  seconds: number;
  progress: number;
  urgent?: boolean;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(1, progress));
  return (
    <div className={cn("relative size-[46px]", className)}>
      <svg width="46" height="46" viewBox="0 0 46 46" className="-rotate-90">
        <circle cx="23" cy="23" r={R} fill="none" stroke="#1E2421" strokeWidth="4" />
        <circle
          cx="23"
          cy="23"
          r={R}
          fill="none"
          stroke={urgent ? "#FFC24D" : "#7CFC4A"}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={CIRC}
          strokeDashoffset={CIRC * (1 - clamped)}
          className="transition-[stroke-dashoffset] duration-200"
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center font-mono text-[15px] font-bold">
        {seconds}
      </div>
    </div>
  );
}
