import { useSpring } from "@react-spring/web";
import { useReducedMotion } from "framer-motion";

// Hover lift and press feedback for cards and buttons; flat when reduced motion is asked for.
export function useLift(distance = 3) {
  const still = useReducedMotion();
  const [style, api] = useSpring(() => ({
    y: 0,
    scale: 1,
    config: { tension: 320, friction: 22 },
  }));

  if (still) return { style: {}, bind: {} };

  return {
    style,
    bind: {
      onMouseEnter: () => api.start({ y: -distance, scale: 1.012 }),
      onMouseLeave: () => api.start({ y: 0, scale: 1 }),
      onPointerDown: () => api.start({ scale: 0.98 }),
      onPointerUp: () => api.start({ scale: 1.012 }),
    },
  };
}
