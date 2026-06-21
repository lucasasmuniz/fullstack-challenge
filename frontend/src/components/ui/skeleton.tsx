import { cn } from "@/lib/utils";

/** Bloco de loading com shimmer (definido em globals.css). */
export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-md bg-[linear-gradient(90deg,#171A18,#1E2421,#171A18)] bg-[length:800px_100%] animate-[shimmer_1.4s_infinite_linear]",
        className,
      )}
      {...props}
    />
  );
}
