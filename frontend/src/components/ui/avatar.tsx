import { cn, initialsOf } from "@/lib/utils";

const SIZES = { sm: "size-7 text-[11px]", md: "size-8 text-[13px]" } as const;

/** Avatar de iniciais (gradiente verde do design). */
export function Avatar({
  name,
  size = "md",
  className,
}: {
  name: string;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "grid place-items-center rounded-full bg-gradient-to-br from-primary-deep to-primary font-display font-bold text-ink",
        SIZES[size],
        className,
      )}
      aria-hidden
    >
      {initialsOf(name)}
    </span>
  );
}
