import { useEffect, useRef, useState } from "react";
import { animate, useInView, useReducedMotion } from "framer-motion";

export function Counter({ to, className = "" }: { to: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.4 });
  const still = useReducedMotion();
  const [n, setN] = useState(0);

  useEffect(() => {
    if (still) {
      setN(to);
      return;
    }
    if (!inView) return;
    const controls = animate(0, to, {
      duration: Math.min(1.6, 0.4 + to * 0.05),
      ease: "easeOut",
      onUpdate: (v) => setN(Math.round(v)),
    });
    return () => controls.stop();
  }, [inView, to, still]);

  return (
    <span ref={ref} className={className}>
      {n.toLocaleString("en-US")}
    </span>
  );
}
