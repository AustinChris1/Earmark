import { useEffect, useRef } from "react";
import { useReducedMotion } from "framer-motion";
import gsap from "gsap";

// Animates the product mechanic: three payers, one locked destination, and a diversion that cannot land.
export function FlowDiagram({ className = "" }: { className?: string }) {
  const root = useRef<SVGSVGElement>(null);
  const still = useReducedMotion();

  useEffect(() => {
    const el = root.current;
    if (!el || still) return;
    const ctx = gsap.context(() => {
      const paths = gsap.utils.toArray<SVGPathElement>(".flow-path");
      paths.forEach((p) => {
        const len = p.getTotalLength();
        gsap.set(p, { strokeDasharray: len, strokeDashoffset: len });
      });
      gsap.set(".payer", { opacity: 0, y: 8 });
      gsap.set([".coin", ".seal"], { scale: 0, transformOrigin: "center" });
      gsap.set(".divert", { opacity: 0 });

      const tl = gsap.timeline({ repeat: -1, repeatDelay: 1.6, defaults: { ease: "power2.out" } });
      tl.to(".payer", { opacity: 1, y: 0, stagger: 0.12, duration: 0.4 })
        .to(paths, { strokeDashoffset: 0, stagger: 0.14, duration: 0.7 }, "-=0.1")
        .to(".coin", { scale: 1, stagger: 0.14, duration: 0.35 }, "<0.15")
        .to(".dest", { scale: 1.03, transformOrigin: "center", duration: 0.25, yoyo: true, repeat: 1 })
        .to(".seal", { scale: 1, duration: 0.4, ease: "back.out(2)" }, "<")
        .to(".divert", { opacity: 1, duration: 0.3 }, "+=0.25")
        .to(".divert-arrow", { y: 14, duration: 0.35, ease: "power1.in" })
        .to(".divert-arrow", { y: 0, duration: 0.6, ease: "elastic.out(1, 0.4)" })
        .to(".divert", { opacity: 0, duration: 0.4 }, "+=0.6")
        .to([".coin", ".seal"], { scale: 0, duration: 0.3 }, "<")
        .to(paths, { strokeDashoffset: (_i, t: SVGPathElement) => t.getTotalLength(), duration: 0.4 }, "<")
        .to(".payer", { opacity: 0.3, duration: 0.3 }, "<");
    }, el);
    return () => ctx.revert();
  }, [still]);

  return (
    <svg
      ref={root}
      viewBox="0 0 480 260"
      className={className}
      fill="none"
      role="img"
      aria-label="Three payers funding one locked destination, with a diversion that cannot land"
    >
      <line x1="0" y1="118" x2="480" y2="118" stroke="var(--line)" strokeDasharray="4 8" opacity="0.5" />

      {[44, 118, 192].map((y, i) => (
        <g key={y} className="payer">
          <circle cx="40" cy={y} r="17" fill="var(--bg-raised)" stroke="var(--line)" strokeWidth="1.5" />
          <text x="40" y={y + 5} textAnchor="middle" fontSize="13" fill="var(--text-muted)" fontFamily="var(--font-sans)">
            {["A", "E", "C"][i]}
          </text>
        </g>
      ))}

      <path className="flow-path" d="M60 44 C 150 44, 170 118, 246 118" stroke="var(--accent)" strokeWidth="2" />
      <path className="flow-path" d="M60 118 L 246 118" stroke="var(--accent)" strokeWidth="2" />
      <path className="flow-path" d="M60 192 C 150 192, 170 118, 246 118" stroke="var(--accent)" strokeWidth="2" />

      <circle className="coin" cx="148" cy="68" r="5" fill="var(--accent)" />
      <circle className="coin" cx="154" cy="118" r="5" fill="var(--accent)" />
      <circle className="coin" cx="148" cy="168" r="5" fill="var(--accent)" />

      <g className="dest">
        <rect x="252" y="86" width="148" height="64" rx="12" fill="var(--bg-raised)" stroke="var(--accent)" strokeWidth="2" />
        <text x="326" y="112" textAnchor="middle" fontSize="13" fill="var(--text)" fontFamily="var(--font-sans)" fontWeight="600">
          Destination
        </text>
        <text x="326" y="131" textAnchor="middle" fontSize="11" fill="var(--text-muted)" fontFamily="var(--font-sans)">
          locked at creation
        </text>
      </g>
      <g className="seal">
        <circle cx="400" cy="86" r="11" fill="var(--accent)" />
        <path d="M395 86.5 l3.4 3.4 L406 82" stroke="var(--accent-ink)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </g>

      <g className="divert">
        <g className="divert-arrow">
          <path d="M326 158 v 24" stroke="var(--pending)" strokeWidth="2" strokeLinecap="round" strokeDasharray="3 5" />
        </g>
        <circle cx="326" cy="204" r="15" fill="none" stroke="var(--pending)" strokeWidth="2" />
        <path d="M319 197 l14 14 M333 197 l-14 14" stroke="var(--pending)" strokeWidth="2" strokeLinecap="round" />
        <text x="326" y="238" textAnchor="middle" fontSize="11" fill="var(--pending)" fontFamily="var(--font-sans)">
          cannot land on a person
        </text>
      </g>
    </svg>
  );
}
