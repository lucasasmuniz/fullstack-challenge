import { cn } from "@/lib/utils";

export type ConnState = "connected" | "reconnecting" | "offline";

const META: Record<ConnState, { label: string; dot: string; text: string }> = {
  connected: { label: "Conectado", dot: "bg-primary", text: "text-faint" },
  reconnecting: {
    label: "Reconectando",
    dot: "bg-warning",
    text: "text-warning",
  },
  offline: { label: "Offline", dot: "bg-danger", text: "text-danger" },
};

/** Indicador de saúde do WebSocket. `latencyMs` opcional (ex.: "Online · 28ms"). */
export function ConnectionStatus({
  state,
  latencyMs,
  className,
}: {
  state: ConnState;
  latencyMs?: number;
  className?: string;
}) {
  const meta = META[state];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-mono text-xs",
        meta.text,
        className,
      )}
    >
      <span
        className={cn(
          "size-[7px] rounded-full",
          meta.dot,
          state !== "offline" && "animate-[pulseDot_1.6s_infinite]",
        )}
      />
      {meta.label}
      {state === "connected" && latencyMs != null && <span>· {latencyMs}ms</span>}
    </span>
  );
}
