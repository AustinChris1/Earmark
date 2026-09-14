import { useSpring } from "@react-spring/web";
import { useReducedMotion } from "framer-motion";

const canHover = () => typeof window !== "undefined" && window.matchMedia("(hover: hover) and (pointer: fine)").matches;

// Hover lift and press feedback for cards and buttons; flat when reduced motion is asked for.
export function useLift(distance = 3) {
  const still = useReducedMotion();
  const [style, api] = useSpring(() => ({
    y: 0,
    scale: 1,
    config: { tension: 320, friction: 22 },
  }));

  if (still) return { style: {}, bind: {} };

  const rest = () => api.start({ y: 0, scale: 1 });
  const lifted = () => api.start({ y: -distance, scale: 1.012 });

  return {
    style,
    bind: {
      onMouseEnter: () => canHover() && lifted(),
      onMouseLeave: rest,
      onPointerDown: () => api.start({ scale: 0.98 }),
      // A touch has no "leave", so releasing must return to rest or the element stays lifted.
      onPointerUp: () => (canHover() ? lifted() : rest()),
      onPointerCancel: rest,
    },
  };
}
