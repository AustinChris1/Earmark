import { useRef } from "react";
import { animated, useSpring } from "@react-spring/web";
import { useInView, useReducedMotion } from "framer-motion";

export function Counter({ to, className = "" }: { to: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.4 });
  const still = useReducedMotion();

  const spring = useSpring({
    n: still || inView ? to : 0,
    from: { n: 0 },
    immediate: !!still,
    config: { mass: 1, tension: 90, friction: 26 },
  });

  return (
    <animated.span ref={ref} className={className}>
      {spring.n.to((v) => Math.round(v).toLocaleString("en-US"))}
    </animated.span>
  );
}
