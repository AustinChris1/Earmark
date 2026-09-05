import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { animated } from "@react-spring/web";
import { ArrowRight, Loader2, Lock, Plus, RefreshCw, Wallet, X } from "lucide-react";
import { formatUnits, isAddress, parseAbi, parseUnits, type Address, type Hex } from "viem";
import { toDataSuffix } from "@celo/attribution-tags";
import { Shell } from "../components/Shell";
import { getConfig, getDrives, type DriveSummary } from "../lib/api";
import { chainFor, connect, publicFor, silentAccount, walletFor, type Config } from "../lib/wallet";
import { useLift } from "../lib/springs";

const EARMARK_ABI = parseAbi([
  "function createDrive(address token, address destination, uint256 target, uint64 deadline, string label) returns (uint256)",
  "function close(uint256 id)",
]);

function short(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function pct(raised: bigint, target: bigint) {
  if (target <= 0n) return 0;
  return Math.min(100, Number((raised * 100n) / target));
}

function DriveRow({ d, mine, onClose }: { d: DriveSummary; mine: boolean; onClose: (id: number) => void }) {
  const raised = BigInt(d.raised);
  const target = BigInt(d.target);
  const amount = (v: bigint) =>
    `${Number(formatUnits(v, d.token.decimals)).toLocaleString("en-US", { maximumFractionDigits: 2 })} ${d.token.symbol}`;

  return (
    <div className="surface rounded-2xl p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold leading-tight">{d.label}</p>
          <p className="mt-1 flex items-center gap-1.5 text-xs" style={{ color: "var(--text-muted)" }}>
            <Lock className="h-3 w-3" /> pays {short(d.destination)}
          </p>
        </div>
        <span
          className="shrink-0 rounded-full px-2.5 py-1 text-xs"
          style={{
            background: d.closed ? "transparent" : "var(--accent-soft)",
            color: d.closed ? "var(--text-muted)" : "var(--accent)",
            border: d.closed ? "1px solid var(--line)" : "none",
          }}
        >
          {d.closed ? "closed" : "open"}
        </span>
      </div>

      {target > 0n && (
        <div className="mt-4">
          <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: "var(--line)" }}>
            <div className="h-full rounded-full" style={{ width: `${pct(raised, target)}%`, background: "var(--accent)" }} />
          </div>
          <div className="mt-2 flex justify-between text-sm">
            <span className="font-semibold">{amount(raised)}</span>
            <span style={{ color: "var(--text-muted)" }}>of {amount(target)}</span>
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Link
          to={`/d/${d.id}`}
          className="inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold"
          style={
            d.closed
              ? { border: "1px solid var(--line)", color: "var(--text-muted)" }
              : { background: "var(--brand)", color: "var(--brand-ink)" }
          }
        >
          {d.closed ? "View" : "Pay"} <ArrowRight className="h-3.5 w-3.5" />
        </Link>
        {mine && !d.closed && (
          <button
            onClick={() => onClose(d.id)}
            className="text-sm underline underline-offset-4"
            style={{ color: "var(--text-muted)" }}
          >
            Close drive
          </button>
        )}
      </div>
    </div>
  );
}

export function AppPage() {
  const [cfg, setCfg] = useState<Config | null>(null);
  const [account, setAccount] = useState<Address | null>(null);
  const [drives, setDrives] = useState<DriveSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [showNew, setShowNew] = useState(false);
  const connectBtn = useLift(2);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, ds] = await Promise.all([getConfig(), getDrives()]);
      setCfg(c);
      setDrives(ds);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    void silentAccount().then((a) => a && setAccount(a));
  }, [load]);

  const mine = useMemo(
    () => (account ? drives.filter((d) => d.collector.toLowerCase() === account.toLowerCase()) : []),
    [drives, account],
  );
  const others = useMemo(
    () => (account ? drives.filter((d) => d.collector.toLowerCase() !== account.toLowerCase()) : drives),
    [drives, account],
  );

  async function onConnect() {
    if (!cfg) return;
    setError("");
    try {
      setAccount(await connect(cfg));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function closeDrive(id: number) {
    if (!cfg || !account) return;
    setError("");
    setBusy(`Closing drive ${id}`);
    try {
      const wallet = walletFor(cfg, account);
      const pub = publicFor(cfg);
      const hash = await wallet.writeContract({
        address: cfg.earmark,
        abi: EARMARK_ABI,
        functionName: "close",
        args: [BigInt(id)],
        chain: chainFor(cfg),
        dataSuffix: cfg.tag ? toDataSuffix(cfg.tag) : undefined,
      } as never);
      await pub.waitForTransactionReceipt({ hash: hash as Hex });
      await load();
    } catch (e) {
      const err = e as { shortMessage?: string; message?: string };
      setError(err.shortMessage ?? err.message ?? "Could not close that drive.");
    } finally {
      setBusy("");
    }
  }

  async function createDrive(form: { amount: string; symbol: string; destination: string; label: string }) {
    if (!cfg || !account) return;
    setError("");
    const token = Object.values(cfg.tokens).find((t) => t.symbol.toLowerCase() === form.symbol.toLowerCase());
    if (!token) return setError("Pick a token.");
    if (!isAddress(form.destination)) return setError("That destination is not a wallet address.");
    if (!form.label.trim()) return setError("Give the drive a name.");
    let target: bigint;
    try {
      target = parseUnits(form.amount, token.decimals);
    } catch {
      return setError("The amount must be a number.");
    }
    if (target <= 0n) return setError("The amount must be greater than zero.");

    setBusy("Opening the drive");
    try {
      const wallet = walletFor(cfg, account);
      const pub = publicFor(cfg);
      const hash = await wallet.writeContract({
        address: cfg.earmark,
        abi: EARMARK_ABI,
        functionName: "createDrive",
        args: [token.address, form.destination as Address, target, 0n, form.label.trim()],
        chain: chainFor(cfg),
        dataSuffix: cfg.tag ? toDataSuffix(cfg.tag) : undefined,
      } as never);
      await pub.waitForTransactionReceipt({ hash: hash as Hex });
      setShowNew(false);
      await load();
    } catch (e) {
      const err = e as { shortMessage?: string; message?: string };
      setError(err.shortMessage ?? err.message ?? "Could not open the drive.");
    } finally {
      setBusy("");
    }
  }

  return (
    <Shell>
      <main className="mx-auto max-w-3xl px-5 pb-20">
        <div className="flex flex-wrap items-end justify-between gap-4 pt-8">
          <div>
            <h1 className="font-display text-4xl tracking-tight">Drives</h1>
            <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
              Everything the bot can do, from a browser.
            </p>
          </div>
          {account ? (
            <div className="flex items-center gap-3">
              <span className="surface rounded-full px-3 py-1.5 font-mono text-xs">{short(account)}</span>
              <button onClick={() => setShowNew(true)} className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold" style={{ background: "var(--brand)", color: "var(--brand-ink)" }}>
                <Plus className="h-4 w-4" /> New drive
              </button>
            </div>
          ) : (
            <animated.button
              {...connectBtn.bind}
              onClick={onConnect}
              className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold"
              style={{ ...connectBtn.style, background: "var(--brand)", color: "var(--brand-ink)" }}
            >
              <Wallet className="h-4 w-4" /> Connect wallet
            </animated.button>
          )}
        </div>

        {busy && (
          <p className="mt-4 flex items-center gap-2 text-sm" style={{ color: "var(--text-muted)" }}>
            <Loader2 className="h-4 w-4 animate-spin" /> {busy}. Confirm in your wallet.
          </p>
        )}
        {error && (
          <p className="mt-4 text-sm" style={{ color: "var(--pending)" }}>
            {error}
          </p>
        )}

        <AnimatePresence>
          {showNew && cfg && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <NewDriveForm cfg={cfg} onCancel={() => setShowNew(false)} onSubmit={createDrive} />
            </motion.div>
          )}
        </AnimatePresence>

        {loading ? (
          <p className="mt-10 flex items-center gap-2 text-sm" style={{ color: "var(--text-muted)" }}>
            <Loader2 className="h-4 w-4 animate-spin" /> Reading the chain
          </p>
        ) : (
          <>
            {account && mine.length > 0 && (
              <section className="mt-10">
                <h2 className="text-xs uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
                  Drives you opened
                </h2>
                <div className="mt-3 grid gap-3">
                  {mine.map((d) => (
                    <DriveRow key={d.id} d={d} mine onClose={closeDrive} />
                  ))}
                </div>
              </section>
            )}

            <section className="mt-10">
              <div className="flex items-center justify-between">
                <h2 className="text-xs uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
                  {account && mine.length > 0 ? "Everything else" : "All drives"}
                </h2>
                <button onClick={load} className="inline-flex items-center gap-1.5 text-xs" style={{ color: "var(--text-muted)" }}>
                  <RefreshCw className="h-3 w-3" /> Refresh
                </button>
              </div>
              {others.length === 0 ? (
                <p className="surface mt-3 rounded-2xl p-6 text-sm" style={{ color: "var(--text-muted)" }}>
                  No drives yet. Open one here, or add Earmark to a group chat and use /new.
                </p>
              ) : (
                <div className="mt-3 grid gap-3">
                  {others.map((d) => (
                    <DriveRow key={d.id} d={d} mine={false} onClose={closeDrive} />
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </Shell>
  );
}

function NewDriveForm({
  cfg,
  onCancel,
  onSubmit,
}: {
  cfg: Config;
  onCancel: () => void;
  onSubmit: (f: { amount: string; symbol: string; destination: string; label: string }) => void;
}) {
  const symbols = Object.values(cfg.tokens).map((t) => t.symbol);
  const [amount, setAmount] = useState("");
  const [symbol, setSymbol] = useState(symbols[0] ?? "USDT");
  const [destination, setDestination] = useState("");
  const [label, setLabel] = useState("");

  const field = "w-full rounded-xl px-3 py-2.5 text-[15px] outline-none";
  const fieldStyle = { border: "1px solid var(--line)", background: "var(--bg-raised)", color: "var(--text)" };

  return (
    <div className="surface mt-6 rounded-2xl p-6">
      <div className="flex items-center justify-between">
        <p className="font-semibold">Open a drive</p>
        <button onClick={onCancel} aria-label="Cancel">
          <X className="h-4 w-4" style={{ color: "var(--text-muted)" }} />
        </button>
      </div>
      <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
        The destination is locked for the life of the drive. Paste the school, landlord or vendor wallet.
      </p>

      <div className="mt-4 grid gap-3">
        <div className="flex gap-3">
          <input
            className={field}
            style={fieldStyle}
            inputMode="decimal"
            placeholder="450"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <select className={field} style={{ ...fieldStyle, maxWidth: 130 }} value={symbol} onChange={(e) => setSymbol(e.target.value)}>
            {symbols.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <input
          className={field}
          style={fieldStyle}
          placeholder="Destination address, 0x…"
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
        />
        <input
          className={field}
          style={fieldStyle}
          placeholder="What is it for? Term 1 fees for Chioma"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <button
          onClick={() => onSubmit({ amount, symbol, destination, label })}
          className="rounded-xl py-3 text-[15px] font-semibold"
          style={{ background: "var(--accent)", color: "var(--accent-ink)" }}
        >
          Open drive
        </button>
      </div>
    </div>
  );
}
