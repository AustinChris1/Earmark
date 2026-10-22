import { useId, useMemo, useState } from "react";
import { coinName } from "../lib/api";
import { COIN_GROUPS, coinFace, coinMatches, orderCoins } from "../lib/coins";

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
      className={`${blocked ? "" : "pressable"} flex flex-col items-center gap-1 rounded-xl px-1 py-2 text-center`}
      style={{
        background: picked ? "var(--bg-raised)" : "transparent",
        boxShadow: picked ? "0 0 0 2px var(--accent)" : undefined,
      }}
    >
      <span className={blocked ? "opacity-40" : undefined}>
        <CoinMark symbol={symbol} className="h-9 w-9" />
      </span>
      <span className="text-xs font-semibold leading-none" style={{ color: "var(--text)", opacity: blocked ? 0.45 : 1 }}>
        {name}
      </span>
      <span className="text-[10px] leading-tight" style={{ color: "var(--text-muted)" }}>
        {face.place}
      </span>
      {blocked && (
        <span className="text-[10px] font-medium leading-tight" style={{ color: "var(--text)" }}>
          Not accepted
        </span>
      )}
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
  const grouped = !query.trim();

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

  const cells = (rows: string[]) => (
    <div className="grid grid-cols-4 gap-1">
      {rows.map((s) => (
        <CoinCell key={s} symbol={s} picked={s === value} blocked={!!paySet && !paySet.has(s)} onPick={() => pick(s)} />
      ))}
    </div>
  );

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
      <div id={listId} role="listbox" aria-label={label} className="mt-2 max-h-80 space-y-3 overflow-y-auto overscroll-contain pr-1">
        {shown.length === 0 && (
          <p className="px-1 py-3 text-sm" style={{ color: "var(--text-muted)" }}>
            No coin matches.
          </p>
        )}
        {grouped
          ? COIN_GROUPS.map((group) => {
              const rows = shown.filter((s) => coinFace(s).group === group);
              if (!rows.length) return null;
              return (
                <div key={group}>
                  <p className="px-1 pb-1 text-xs" style={{ color: "var(--text-muted)" }}>
                    {group}
                  </p>
                  {cells(rows)}
                </div>
              );
            })
          : cells(shown)}
      </div>
      {(note || (paySet && !query.trim())) && (
        <p className="mt-2 text-xs" style={{ color: note ? "var(--text)" : "var(--text-muted)" }}>
          {note ?? "These can pay this drive. Search if you hold another coin."}
        </p>
      )}
    </div>
  );
}
