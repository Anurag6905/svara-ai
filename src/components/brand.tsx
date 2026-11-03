/** SVARA wordmark: a stylised voice waveform in a black tile. */
export function Logo({ inverted = false }: { inverted?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg viewBox="0 0 28 28" className="size-7" aria-hidden fill="none" strokeWidth="2.2" strokeLinecap="round">
        <rect width="28" height="28" rx="8" fill={inverted ? "#ffffff" : "#0a0a0a"} />
        <g stroke={inverted ? "#0a0a0a" : "#ffffff"}>
          <path d="M7 14v0" />
          <path d="M10.5 10.5v7" />
          <path d="M14 7.5v13" />
          <path d="M17.5 11v6" />
          <path d="M21 14h0" />
        </g>
      </svg>
      <span className={`text-[15px] font-semibold tracking-[0.08em] ${inverted ? "text-white" : "text-ink"}`}>
        SVARA
        <span className={`ml-1 font-normal tracking-normal ${inverted ? "text-white/60" : "text-ink-3"}`}>AI</span>
      </span>
    </span>
  );
}
