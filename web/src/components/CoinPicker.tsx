import { useId, useMemo, useState } from "react";
import { coinName } from "../lib/api";
import { coinFace, coinMatches, orderCoins } from "../lib/coins";

export function CoinMark({ symbol, className = "h-8 w-8" }: { symbol: string; className?: string }) {
  const face = coinFace(symbol);
  if (face.icon) {
    return (
      <span className={`flex ${className} shrink-0 items-center justify-center overflow-hidden rounded-full bg-white ring-1 ring-black/5`}>
        <img src={face.icon} alt="" className={face.padded ? "h-[68%] w-[68%] object-contain" : "h-full w-full object-cover"} />
      </span>
    );
  }
  const letters = symbol.replace(/m$/, "").slice(0, 4);
  return (
    <span
      className={`flex ${className} shrink-0 items-center justify-center rounded-full text-[10px] font-bold tracking-tight`}
      style={{ background: "var(--brand)", color: "var(--brand-ink)" }}
    >
      {letters}
    </span>
  );
}

function CoinCell({
  symbol,
  picked,
  blocked,
  onPick,
}: {
  symbol: string;
  picked: boolean;
  blocked: boolean;
  onPick: () => void;
}) {
  const face = coinFace(symbol);
  const name = coinName(symbol);
  return (
    <button
      type="button"
      role="option"
      aria-selected={picked}
      aria-disabled={blocked}
      aria-label={blocked ? `${name}, ${face.place}, not accepted on this drive` : `${name}, ${face.place}`}
      onClick={onPick}
      className={`${blocked ? "" : "pressable"} inline-flex max-w-full items-center gap-1.5 rounded-full py-1 pl-1 pr-2.5 text-left`}
      style={{
        background: picked ? "var(--bg-raised)" : "transparent",
        boxShadow: picked ? "0 0 0 2px var(--accent)" : "inset 0 0 0 1px var(--line)",
        opacity: blocked ? 0.5 : 1,
      }}
    >
      <CoinMark symbol={symbol} className="h-6 w-6" />
      <span className="min-w-0">
        <span className="block whitespace-nowrap text-xs font-semibold leading-none" style={{ color: "var(--text)" }}>
          {name}
        </span>
        <span className="mt-0.5 block whitespace-nowrap text-[10px] leading-none" style={{ color: "var(--text-muted)" }}>
          {blocked ? `${face.place} · not accepted` : face.place}
        </span>
      </span>
    </button>
  );
}

function heldLine(symbol: string): string {
  const money = coinFace(symbol).money;
  return `${money.charAt(0).toUpperCase()}${money.slice(1)} (${coinName(symbol)})`;
}

/**
 * Every stablecoin the product accepts, each with its mark.
 * On a drive, the open list is only the coins that can pay it. Search still finds the rest,
 * and choosing one explains which money it is and which money the drive collects.
 */
export function CoinPicker({
  symbols,
  value,
  onChange,
  payable,
  collects,
  label,
}: {
  symbols: string[];
  value: string;
  onChange: (symbol: string) => void;
  /** Coins that can actually settle this drive. Omit it where every coin is a valid choice. */
  payable?: string[];
  /** The coin this drive collects, so a refusal can name it. */
  collects?: string;
  label: string;
}) {
  const searchId = useId();
  const listId = useId();
  const [query, setQuery] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const ordered = useMemo(() => orderCoins(symbols), [symbols]);
  const paySet = useMemo(() => (payable ? new Set(payable) : null), [payable]);
  const shown = useMemo(() => {
    const matched = ordered.filter((s) => coinMatches(s, query));
    if (paySet && !query.trim()) return matched.filter((s) => paySet.has(s));
    return matched;
  }, [ordered, query, paySet]);
  function pick(symbol: string) {
    if (paySet && !paySet.has(symbol)) {
      const held = heldLine(symbol);
      setNote(
        collects
          ? `${held} cannot pay this drive. This drive collects ${coinFace(collects).money} (${coinName(collects)}).`
          : `${held} cannot pay this drive.`,
      );
      return;
    }
    setNote(null);
    onChange(symbol);
  }

  const faded = shown.some((s) => paySet && !paySet.has(s));

  return (
    <div>
      <label className="text-sm" style={{ color: "var(--text-muted)" }} htmlFor={searchId}>
        {label}
      </label>
      <input
        id={searchId}
        className="field mt-2"
        placeholder={`Search ${ordered.length} coins`}
        aria-label={label}
        aria-controls={listId}
        aria-autocomplete="list"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setNote(null);
        }}
        autoComplete="off"
      />
      <div id={listId} role="listbox" aria-label={label} className="mt-2 flex flex-wrap gap-1.5 p-0.5">
        {shown.length === 0 && (
          <p className="px-1 py-2 text-sm" style={{ color: "var(--text-muted)" }}>
            No coin matches.
          </p>
        )}
        {shown.map((s) => (
          <CoinCell key={s} symbol={s} picked={s === value} blocked={!!paySet && !paySet.has(s)} onPick={() => pick(s)} />
        ))}
      </div>
      {(note || (paySet && !query.trim()) || faded) && (
        <p className="mt-2 text-xs" style={{ color: note ? "var(--text)" : "var(--text-muted)" }}>
          {note ?? (faded ? "Faded coins are not accepted on this drive." : "These can pay this drive. Search if you hold another coin.")}
        </p>
      )}
    </div>
  );
}
