"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Interpola um valor numérico (centavos) ao mudar, para um count-up suave (ex.: saldo creditando).
 * Usa rAF; respeita `prefers-reduced-motion` saltando direto ao alvo.
 */
export function useCountUp(target: number, durationMs = 600): number {
  const [value, setValue] = useState(target);
  const fromRef = useRef(target);
  const startRef = useRef(0);

  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || fromRef.current === target) {
      fromRef.current = target;
      setValue(target);
      return;
    }

    const from = fromRef.current;
    let raf = 0;
    const tick = (now: number) => {
      if (!startRef.current) startRef.current = now;
      const t = Math.min(1, (now - startRef.current) / durationMs);
      const eased = 1 - (1 - t) ** 3; // ease-out cubic
      setValue(Math.round(from + (target - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = target;
    };
    raf = requestAnimationFrame(tick);
    startRef.current = 0;
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);

  return value;
}
