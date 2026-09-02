// The mark: a notch cut into an ear, the oldest way of saying this one is already spoken for.
const EAR_OUTLINE =
  "M16.5 4.5C21 5 23.6 8 23 11.5L16.6 12.4L22.6 17.4C21.5 21 17.5 24 14 28C10 26 6 21 5.5 15C5 9 10 4 16.5 4.5Z";
const EAR_CONCHA = "M11.8 20C10.5 18 10.6 14.8 12.3 13.3C13.8 12 16 12.2 17 13.9";

export function Mark({ className = "", title }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role={title ? "img" : "presentation"}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <path d={EAR_OUTLINE} />
      <path d={EAR_CONCHA} />
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <Mark className="h-7 w-7 text-[var(--accent)]" />
      <span className="font-display text-[1.6rem] leading-none tracking-tight">Earmark</span>
    </span>
  );
}
